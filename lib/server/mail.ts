import fs from "node:fs"
import path from "node:path"
import nodemailer from "nodemailer"

/* Envío de correos. Dos caminos:
   - Resend (RESEND_API_KEY): API por HTTPS. Es el de Render: el plan gratis
     bloquea los puertos SMTP (25, 465 y 587) desde septiembre de 2025.
   - SMTP (Gmail con GMAIL_USER + GMAIL_APP_PASSWORD, o SMTP_HOST): sirve en
     local o en un plan pago de Render.
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

export interface Mailer {
  provider: "resend" | "smtp"
  send(mail: OutgoingMail): Promise<string>
}

/** Error del proveedor con lo necesario para explicarlo */
export class MailError extends Error {
  constructor(
    message: string,
    readonly info: { provider: "resend" | "smtp"; status?: number; code?: string },
  ) {
    super(message)
  }
}

export const MAILER_MISSING =
  "Falta configurar el envío de correos: RESEND_API_KEY (Resend) o GMAIL_USER y GMAIL_APP_PASSWORD en las variables de entorno."

export const senderName = () => process.env.MAIL_FROM_NAME || "Apex Consulting"

/** Cuenta que figura como remitente */
export function senderAddress() {
  if (process.env.RESEND_API_KEY) return process.env.MAIL_FROM || "onboarding@resend.dev"
  return process.env.GMAIL_USER || process.env.SMTP_USER || ""
}

/** A dónde llegan las respuestas de los clientes y las copias: el Gmail de siempre */
export const replyToAddress = () => process.env.MAIL_REPLY_TO || process.env.GMAIL_USER || senderAddress()

export function mailer(): Mailer | null {
  const key = process.env.RESEND_API_KEY
  if (key) return resendMailer(key)
  if (process.env.SMTP_HOST) {
    return smtpMailer(
      nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "1",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      }),
    )
  }
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return null
  // Google muestra la contraseña de aplicación en grupos de 4 con espacios
  return smtpMailer(nodemailer.createTransport({ service: "gmail", auth: { user, pass: pass.replace(/\s+/g, "") } }))
}

function smtpMailer(transport: nodemailer.Transporter): Mailer {
  return {
    provider: "smtp",
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
        throw new MailError(String(e?.message ?? e), { provider: "smtp", code: e?.code, status: e?.responseCode })
      }
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
  const info = e instanceof MailError ? e.info : { provider: "smtp" as const, code: (e as any)?.code, status: undefined }
  if (info.provider === "resend") {
    if (info.status === 401 || /api key/i.test(msg)) return "Resend rechazó la clave: revisa RESEND_API_KEY en Render."
    if (/domain.*not verified|verify a domain|testing emails|own email address/i.test(msg)) {
      return "Resend todavía no tiene verificado el dominio del remitente (MAIL_FROM). Hasta verificarlo solo puedes enviarte pruebas a tu propio correo."
    }
    if (info.code === "NETWORK") return "No hubo conexión con Resend. Intenta de nuevo en un momento."
    return `Resend no aceptó el correo: ${msg}`
  }
  if (/invalid login|username and password|535/i.test(msg)) return "Gmail rechazó el acceso: revisa GMAIL_USER y la contraseña de aplicación."
  if (/ETIMEDOUT|ECONNECTION|ESOCKET|ECONNREFUSED|EDNS|timeout|Greeting never received/i.test(`${info.code} ${msg}`)) {
    return "No hay conexión con el servidor de correo (SMTP). Render bloquea SMTP en el plan gratis: configura RESEND_API_KEY."
  }
  return "No se pudo enviar el correo. Intenta de nuevo en un momento."
}
