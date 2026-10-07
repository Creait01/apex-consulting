import fs from "node:fs"
import path from "node:path"
import nodemailer from "nodemailer"

/* Envío de correos. Por orden de preferencia:
   - Gmail (GMAIL_USER + GMAIL_APP_PASSWORD): los correos salen de tu cuenta.
     En Render el plan gratis bloquea los puertos SMTP (25, 465 y 587) desde
     septiembre de 2025, así que allí se entregan por la Edge Function
     "enviar-correo" de Supabase (puerto 465). En local, directo a Gmail.
     GMAIL_VIA=supabase o GMAIL_VIA=smtp fuerza uno u otro camino.
   - Resend (RESEND_API_KEY + MAIL_FROM en un dominio verificado).
   - SMTP_HOST: cualquier otro servidor SMTP (pruebas).
   El resto de la app solo usa mailer().send(). */

export interface OutgoingMail {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  html: string
  text: string
  attachments: { filename: string; content: Buffer; contentType?: string; cid?: string }[]
}

export type MailProvider = "gmail-supabase" | "gmail" | "resend" | "smtp"

export interface Mailer {
  provider: MailProvider
  send(mail: OutgoingMail): Promise<string>
}

/** Error del proveedor con lo necesario para explicarlo */
export class MailError extends Error {
  constructor(
    message: string,
    readonly info: { provider: MailProvider; status?: number; code?: string },
  ) {
    super(message)
  }
}

export const MAILER_MISSING =
  "Falta configurar el envío de correos: GMAIL_USER y GMAIL_APP_PASSWORD (o RESEND_API_KEY) en las variables de entorno."

export const senderName = () => process.env.MAIL_FROM_NAME || "Apex Consulting"

const gmail = () => {
  const user = process.env.GMAIL_USER?.trim()
  // Google muestra la contraseña de aplicación en grupos de 4 con espacios
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "")
  return user && pass ? { user, pass } : null
}

/** En Render (o si se pide) Gmail va por Supabase: Render no deja salir SMTP */
const gmailViaSupabase = () =>
  process.env.GMAIL_VIA === "supabase" || (process.env.GMAIL_VIA !== "smtp" && process.env.RENDER === "true")

/** Cuenta que figura como remitente */
export function senderAddress() {
  const g = gmail()
  if (g) return g.user
  if (process.env.RESEND_API_KEY) return process.env.MAIL_FROM?.trim() || "onboarding@resend.dev"
  return process.env.SMTP_USER || ""
}

/** A dónde llegan las respuestas de los clientes y las copias: tu Gmail */
export const replyToAddress = () => process.env.MAIL_REPLY_TO || process.env.GMAIL_USER || senderAddress()

const SMTP_TIMEOUTS = { connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 60_000 }

export function mailer(): Mailer | null {
  const g = gmail()
  if (g) {
    if (gmailViaSupabase()) return supabaseGmailMailer(g)
    return smtpMailer("gmail", nodemailer.createTransport({ service: "gmail", auth: g, ...SMTP_TIMEOUTS }))
  }
  const key = process.env.RESEND_API_KEY?.trim()
  if (key) return resendMailer(key)
  if (process.env.SMTP_HOST) {
    return smtpMailer(
      "smtp",
      nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "1",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        ...SMTP_TIMEOUTS,
      }),
    )
  }
  return null
}

function smtpMailer(provider: MailProvider, transport: nodemailer.Transporter): Mailer {
  return {
    provider,
    async send(m) {
      try {
        const info = await transport.sendMail({
          from: { name: senderName(), address: senderAddress() },
          to: m.to,
          cc: m.cc?.length ? m.cc : undefined,
          bcc: m.bcc?.length ? m.bcc : undefined,
          replyTo: replyToAddress(),
          subject: m.subject,
          html: m.html,
          text: m.text,
          attachments: m.attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType, cid: a.cid })),
        })
        return info.messageId
      } catch (e: any) {
        throw new MailError(String(e?.message ?? e), { provider, code: e?.code, status: e?.responseCode })
      }
    },
  }
}

/** Gmail a través de la Edge Function enviar-correo (supabase/functions/enviar-correo) */
function supabaseGmailMailer(auth: { user: string; pass: string }): Mailer {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/enviar-correo`
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  return {
    provider: "gmail-supabase",
    async send(m) {
      let res: Response
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
          body: JSON.stringify({
            auth,
            fromName: senderName(),
            to: m.to,
            cc: m.cc,
            bcc: m.bcc,
            replyTo: replyToAddress(),
            subject: m.subject,
            html: m.html,
            text: m.text,
            attachments: m.attachments.map((a) => ({
              filename: a.filename,
              content: a.content.toString("base64"),
              contentType: a.contentType,
              cid: a.cid,
            })),
          }),
        })
      } catch (e: any) {
        throw new MailError(String(e?.message ?? e), { provider: "gmail-supabase", code: "NETWORK" })
      }
      const json: any = await res.json().catch(() => ({}))
      if (res.ok) return String(json.id ?? "")
      throw new MailError(String(json.error || json.msg || json.message || `Supabase respondió ${res.status}`), {
        provider: "gmail-supabase",
        status: json.responseCode ?? res.status,
        code: json.code ?? undefined,
      })
    },
  }
}

function resendMailer(key: string): Mailer {
  const url = (process.env.RESEND_API_URL || "https://api.resend.com") + "/emails"
  return {
    provider: "resend",
    async send(m) {
      const body = JSON.stringify({
        from: `${senderName()} <${senderAddress()}>`,
        to: m.to,
        cc: m.cc?.length ? m.cc : undefined,
        bcc: m.bcc?.length ? m.bcc : undefined,
        reply_to: replyToAddress(),
        subject: m.subject,
        html: m.html,
        text: m.text,
        attachments: m.attachments.map((a) => ({
          filename: a.filename,
          content: a.content.toString("base64"),
          content_type: a.contentType,
          content_id: a.cid,
        })),
      })
      const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
      // Resend admite pocas solicitudes por segundo: ante un 429 se espera y se reintenta
      for (let attempt = 0; ; attempt++) {
        let res: Response
        try {
          res = await fetch(url, { method: "POST", headers, body })
        } catch (e: any) {
          throw new MailError(String(e?.message ?? e), { provider: "resend", code: "NETWORK" })
        }
        const json: any = await res.json().catch(() => ({}))
        if (res.ok) return String(json.id ?? "")
        if (res.status === 429 && attempt < 3) {
          await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)))
          continue
        }
        throw new MailError(String(json.message || `Resend respondió ${res.status}`), { provider: "resend", status: res.status, code: json.name })
      }
    },
  }
}

/** Logo incrustado en el correo (Gmail no muestra SVG ni imágenes de localhost) */
export function logoAttachments(): OutgoingMail["attachments"] {
  const img = (file: string, cid: string) => ({
    filename: file,
    content: fs.readFileSync(path.join(process.cwd(), "public", "email", file)),
    contentType: "image/png",
    cid,
  })
  return [img("apex-logo.png", "apex-logo"), img("apex-logo-blanco.png", "apex-logo-blanco")]
}

export const safeFilename = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "-")

/** Mensaje entendible para un error del envío */
export function mailErrorMessage(e: unknown) {
  const msg = String((e as any)?.message ?? "")
  const info = e instanceof MailError ? e.info : { provider: "smtp" as MailProvider, code: (e as any)?.code, status: undefined }
  if (info.provider === "resend") {
    if (info.status === 401 || /api key/i.test(msg)) return "Resend rechazó la clave: revisa RESEND_API_KEY en Render."
    if (/domain.*not verified|verify a domain|testing emails|own email address/i.test(msg)) {
      return "Resend todavía no tiene verificado el dominio del remitente (MAIL_FROM). Hasta verificarlo solo puedes enviarte pruebas a tu propio correo."
    }
    if (info.code === "NETWORK") return "No hubo conexión con Resend. Intenta de nuevo en un momento."
    return `Resend no aceptó el correo: ${msg}`
  }
  if (info.code === "EAUTH" || /invalid login|username and password|535/i.test(msg)) {
    return "Gmail rechazó el acceso: revisa GMAIL_USER y la contraseña de aplicación (16 letras) en Render."
  }
  if (info.provider === "gmail-supabase") {
    if (info.code === "NETWORK") return "No hubo conexión con el puente de correo de Supabase. Intenta de nuevo en un momento."
    if (info.status === 401 || info.status === 404) return "El puente de correo de Supabase no respondió (función enviar-correo)."
  }
  if (/ETIMEDOUT|ECONNECTION|ESOCKET|ECONNREFUSED|EDNS|timeout|Greeting never received/i.test(`${info.code} ${msg}`)) {
    return "No hay conexión con el servidor de correo de Gmail. Intenta de nuevo en un momento."
  }
  return "No se pudo enviar el correo. Intenta de nuevo en un momento."
}
