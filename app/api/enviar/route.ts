import path from "node:path"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { htmlToPdf } from "@/lib/server/pdf"
import { mailer, senderAddress, senderName } from "@/lib/server/mail"

/* Envía al cliente un estado de cuenta o un presupuesto: el documento completo
   dentro del correo (con el logo incrustado) y, si se pide, el PDF adjunto (el
   mismo HTML que se imprime). Solo para usuarios con sesión. */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

interface SendRequest {
  to: string
  cc?: string
  copyMe?: boolean
  subject: string
  emailHtml: string
  emailText: string
  attachPdf?: boolean
  pdfHtml: string
  filename: string
}

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(request: Request) {
  const cookieStore = cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  })
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail("La sesión venció. Vuelve a entrar.", 401)

  let body: SendRequest
  try {
    body = await request.json()
  } catch {
    return fail("Solicitud inválida.")
  }

  const list = (v?: string) =>
    String(v ?? "")
      .split(/[,;]/)
      .map((x) => x.trim())
      .filter(Boolean)
  const to = list(body.to)
  const cc = list(body.cc)
  if (!to.length) return fail("Indica el correo del cliente.")
  if ([...to, ...cc].some((e) => !EMAIL.test(e))) return fail("Revisa los correos: hay uno que no es válido.")
  if (!body.subject?.trim()) return fail("Falta el asunto.")
  const attachPdf = body.attachPdf !== false
  if (!body.emailHtml || body.emailHtml.length > 1_000_000 || (attachPdf && (!body.pdfHtml || body.pdfHtml.length > 3_000_000))) {
    return fail("El documento no es válido.")
  }

  const transport = mailer()
  if (!transport) {
    return fail("Falta configurar el correo de envío (GMAIL_USER y GMAIL_APP_PASSWORD en las variables de entorno).", 503)
  }

  let pdf: Buffer | null = null
  if (attachPdf) {
    try {
      pdf = await htmlToPdf(body.pdfHtml)
    } catch (e: any) {
      console.error("[enviar] PDF", e)
      return fail("No se pudo generar el PDF del documento. Prueba a enviarlo sin el PDF adjunto.", 500)
    }
  }

  // Logo incrustado en el correo (Gmail no muestra SVG ni imágenes de localhost)
  const img = (file: string, cid: string) => ({ filename: file, path: path.join(process.cwd(), "public", "email", file), cid })
  const attachments: any[] = [img("apex-logo.png", "apex-logo"), img("apex-logo-blanco.png", "apex-logo-blanco")]
  if (pdf) attachments.push({ filename: body.filename.replace(/[\\/:*?"<>|]+/g, "-"), content: pdf, contentType: "application/pdf" })

  const from = senderAddress()
  try {
    const info = await transport.sendMail({
      from: { name: senderName(), address: from },
      to,
      cc: cc.length ? cc : undefined,
      bcc: body.copyMe ? user.email ?? from : undefined,
      replyTo: from,
      subject: body.subject.trim(),
      html: body.emailHtml,
      text: body.emailText,
      attachments,
    })
    return NextResponse.json({ ok: true, messageId: info.messageId })
  } catch (e: any) {
    console.error("[enviar] SMTP", e)
    const auth = /invalid login|username and password|535/i.test(String(e?.message))
    return fail(
      auth
        ? "Gmail rechazó el acceso: revisa GMAIL_USER y la contraseña de aplicación."
        : "No se pudo enviar el correo. Intenta de nuevo en un momento.",
      502,
    )
  }
}
