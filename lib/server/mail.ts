import path from "node:path"
import nodemailer from "nodemailer"

/* Envío de correos desde la cuenta de Gmail de Apex con una "contraseña de
   aplicación" (GMAIL_USER + GMAIL_APP_PASSWORD). Si se define SMTP_HOST se usa
   ese servidor SMTP en su lugar (sirve para pruebas o para cambiar de proveedor). */

export function mailer() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "1",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  }
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return null
  // Google muestra la contraseña de aplicación en grupos de 4 con espacios
  return nodemailer.createTransport({ service: "gmail", auth: { user, pass: pass.replace(/\s+/g, "") } })
}

export type Mailer = NonNullable<ReturnType<typeof mailer>>

export const MAILER_MISSING = "Falta configurar el correo de envío (GMAIL_USER y GMAIL_APP_PASSWORD en las variables de entorno)."

/** Cuenta que envía (y a la que responden los clientes) */
export const senderAddress = () => process.env.GMAIL_USER || process.env.SMTP_USER || ""

export const senderName = () => process.env.MAIL_FROM_NAME || "Apex Consulting"

/** Logo incrustado en el correo (Gmail no muestra SVG ni imágenes de localhost) */
export function logoAttachments() {
  const img = (file: string, cid: string) => ({ filename: file, path: path.join(process.cwd(), "public", "email", file), cid })
  return [img("apex-logo.png", "apex-logo"), img("apex-logo-blanco.png", "apex-logo-blanco")]
}

export const safeFilename = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "-")

/** Mensaje entendible para un error del servidor de correo */
export function smtpErrorMessage(e: unknown) {
  return /invalid login|username and password|535/i.test(String((e as any)?.message))
    ? "Gmail rechazó el acceso: revisa GMAIL_USER y la contraseña de aplicación."
    : "No se pudo enviar el correo. Intenta de nuevo en un momento."
}
