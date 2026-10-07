import { NextResponse } from "next/server"
import { htmlToPdf } from "@/lib/server/pdf"
import { MAILER_MISSING, logoAttachments, mailErrorMessage, mailer, replyToAddress, safeFilename } from "@/lib/server/mail"
import { sessionClient } from "@/lib/server/supabase"
import { EMAIL_RE, splitEmails } from "@/lib/rows"

/* Envía al cliente un estado de cuenta o un presupuesto: el aviso con el logo
   incrustado y el PDF adjunto (el mismo HTML que se imprime). Puede ir a varios
   correos. Solo para usuarios con sesión; cada envío queda en email_log. */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

interface SendRequest {
  /** Uno o varios correos (lista o texto separado por comas) */
  to: string | string[]
  cc?: string
  copyMe?: boolean
  subject: string
  emailHtml: string
  emailText: string
  attachPdf?: boolean
  pdfHtml: string
  filename: string
  /** Para el registro de envíos */
  log?: { kind: "statement" | "budget"; clientName: string; budgetId?: string | null; amount?: number | null }
}

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(request: Request) {
  const supabase = sessionClient()
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

  const unique = (list: string[]) => Array.from(new Set(list.map((e) => e.toLowerCase())))
  const to = unique(Array.isArray(body.to) ? body.to.flatMap(splitEmails) : splitEmails(body.to))
  const cc = unique(splitEmails(body.cc)).filter((e) => !to.includes(e))
  if (!to.length) return fail("Indica el correo del cliente.")
  if (to.length + cc.length > 20) return fail("Son demasiados destinatarios (máximo 20).")
  if ([...to, ...cc].some((e) => !EMAIL_RE.test(e))) return fail("Revisa los correos: hay uno que no es válido.")
  if (!body.subject?.trim()) return fail("Falta el asunto.")
  const attachPdf = body.attachPdf !== false
  if (!body.emailHtml || body.emailHtml.length > 1_000_000 || (attachPdf && (!body.pdfHtml || body.pdfHtml.length > 3_000_000))) {
    return fail("El documento no es válido.")
  }

  const transport = mailer()
  if (!transport) return fail(MAILER_MISSING, 503)

  // Tiempos de cada paso: salen en el registro del servidor y en la respuesta
  const t0 = Date.now()
  const timing = { pdfMs: 0, sendMs: 0 }
  let pdf: Buffer | null = null
  if (attachPdf) {
    try {
      pdf = await htmlToPdf(body.pdfHtml)
      timing.pdfMs = Date.now() - t0
    } catch (e: any) {
      console.error("[enviar] PDF", e)
      return fail("No se pudo generar el PDF del documento. Intenta de nuevo en un momento.", 500)
    }
  }

  const attachments = logoAttachments()
  if (pdf) attachments.push({ filename: safeFilename(body.filename), content: pdf, contentType: "application/pdf" })

  const log = async (status: "sent" | "error", error: string | null) => {
    if (!body.log?.clientName) return
    // Sin la migración 12 la tabla no existe: el envío no depende del registro
    const { error: logError } = await supabase.from("email_log").insert({
      kind: body.log.kind === "budget" ? "budget" : "statement",
      origin: "manual",
      client_name: body.log.clientName.slice(0, 255),
      budget_id: body.log.budgetId ?? null,
      recipients: [...to, ...cc],
      subject: body.subject.trim().slice(0, 300),
      amount: body.log.amount == null ? null : Math.round(body.log.amount * 100) / 100,
      status,
      error,
      user_id: user.id,
    })
    if (logError && logError.code !== "42P01") console.error("[enviar] registro", logError)
  }

  try {
    const copy = user.email ?? replyToAddress()
    const t1 = Date.now()
    const id = await transport.send({
      to,
      cc,
      bcc: body.copyMe && copy && !to.includes(copy) && !cc.includes(copy) ? [copy] : [],
      subject: body.subject.trim(),
      html: body.emailHtml,
      text: body.emailText,
      attachments,
    })
    timing.sendMs = Date.now() - t1
    console.info(`[enviar] ${transport.provider}: PDF ${timing.pdfMs} ms · correo ${timing.sendMs} ms`)
    await log("sent", null)
    return NextResponse.json({ ok: true, to, messageId: id, timing })
  } catch (e: any) {
    console.error(`[enviar] ${transport.provider}`, e)
    const message = mailErrorMessage(e)
    await log("error", `${message} (${String(e?.message ?? e).slice(0, 200)})`)
    return fail(message, 502)
  }
}
