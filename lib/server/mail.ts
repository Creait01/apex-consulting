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

/** Cuenta que envía (y a la que responden los clientes) */
export const senderAddress = () => process.env.GMAIL_USER || process.env.SMTP_USER || ""

export const senderName = () => process.env.MAIL_FROM_NAME || "Apex Consulting"
