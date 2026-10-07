import { NextResponse } from "next/server"
import { sessionClient } from "@/lib/server/supabase"
import { mailer, replyToAddress, senderAddress } from "@/lib/server/mail"

/* Qué servicio de correo ve el servidor (sin mostrar claves): sirve para
   comprobar en Ajustes que las variables de entorno de Render se aplicaron. */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const {
    data: { user },
  } = await sessionClient().auth.getUser()
  if (!user) return NextResponse.json({ error: "La sesión venció." }, { status: 401 })
  const m = mailer()
  return NextResponse.json({
    provider: m?.provider ?? null,
    from: m ? senderAddress() : null,
    replyTo: m ? replyToAddress() : null,
    resendKey: Boolean(process.env.RESEND_API_KEY),
    mailFrom: Boolean(process.env.MAIL_FROM),
    gmailPassword: Boolean(process.env.GMAIL_APP_PASSWORD),
    host: process.env.RENDER_SERVICE_NAME ?? null,
  })
}
