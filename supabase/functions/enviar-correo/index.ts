// Puente de correo: entrega por Gmail lo que arma la app.
//
// Render (plan gratis) bloquea los puertos SMTP, así que la app no puede hablar
// con Gmail. Las Edge Functions de Supabase solo bloquean 25 y 587, y Gmail
// acepta SMTP con SSL en el 465. La app manda aquí el correo ya armado (HTML,
// texto, logo y PDF en base64) junto con la cuenta y la contraseña de
// aplicación de Gmail, que viven en las variables de Render; esta función no
// guarda nada. Sin una contraseña de aplicación válida no sale ningún correo.
//
// Despliegue: supabase functions deploy enviar-correo (verify_jwt = true; la
// app la llama con la clave pública del proyecto).

import nodemailer from "npm:nodemailer@6.10.1"

interface Attachment {
  filename: string
  /** Base64 */
  content: string
  contentType?: string
  cid?: string
}

interface Payload {
  auth: { user: string; pass: string }
  fromName?: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  replyTo?: string
  subject: string
  html: string
  text: string
  attachments?: Attachment[]
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405)

  let p: Payload
  try {
    p = await req.json()
  } catch {
    return json({ error: "Solicitud inválida." }, 400)
  }
  if (!p?.auth?.user || !p?.auth?.pass || !Array.isArray(p.to) || p.to.length === 0 || !p.subject) {
    return json({ error: "Faltan la cuenta, los destinatarios o el asunto." }, 400)
  }

  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    // Google muestra la contraseña de aplicación en grupos de 4 con espacios
    auth: { user: p.auth.user, pass: p.auth.pass.split(" ").join("") },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  })

  try {
    const info = await transport.sendMail({
      from: { name: p.fromName || "Apex Consulting", address: p.auth.user },
      to: p.to,
      cc: p.cc?.length ? p.cc : undefined,
      bcc: p.bcc?.length ? p.bcc : undefined,
      replyTo: p.replyTo || p.auth.user,
      subject: p.subject,
      html: p.html,
      text: p.text,
      attachments: (p.attachments ?? []).map((a) => ({
        filename: a.filename,
        content: a.content,
        encoding: "base64",
        contentType: a.contentType,
        cid: a.cid,
      })),
    })
    return json({ id: info.messageId })
  } catch (e) {
    const err = e as { message?: string; code?: string; responseCode?: number }
    console.error("[enviar-correo]", err?.code, err?.message)
    return json({ error: String(err?.message ?? e), code: err?.code ?? null, responseCode: err?.responseCode ?? null }, 502)
  } finally {
    transport.close()
  }
})
