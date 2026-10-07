import { statementReport } from "@/lib/reports"
import { CID_ASSETS, defaultStatementMessage, pdfName, statementEmail } from "@/lib/emails"
import { toBudget, toClientRecord, toPayment, toSettings } from "@/lib/rows"
import { weeklyPlan, type WeeklyItem } from "@/lib/weekly"
import { EPS } from "@/lib/metrics"
import { openPdfRenderer } from "./pdf"
import { MAILER_MISSING, logoAttachments, mailer, safeFilename, senderAddress, senderName, smtpErrorMessage } from "./mail"

/* Arma y envía el estado de cuenta semanal de cada cliente que corresponde: el
   mismo aviso y el mismo PDF que se mandan a mano desde la ficha del cliente,
   con lo sugerido (anticipo o saldo, vencido según el plazo). */

/** Datos crudos de la base (los devuelve statement_run_data o se leen con la sesión) */
export interface WeeklyData {
  today: string
  settings: any
  budgets: any[]
  payments: any[]
  clients: any[]
  /** Clientes que ya lo recibieron en esta corrida (reintento) */
  sent?: string[]
}

export interface WeeklyResult {
  client: string
  recipients: string[]
  subject: string
  amount: number
  status: "sent" | "error"
  error?: string
}

export class WeeklyRunError extends Error {}

export async function runWeekly(
  data: WeeklyData,
  opts: {
    /** Prueba: todo va solo a este correo, con "[Prueba]" en el asunto */
    testTo?: string
    onResult: (r: WeeklyResult) => Promise<void>
  },
) {
  const settings = toSettings(data.settings)
  const today = String(data.today).slice(0, 10)
  const plan = weeklyPlan({
    budgets: (data.budgets ?? []).map(toBudget),
    payments: (data.payments ?? []).map(toPayment),
    clients: (data.clients ?? []).map(toClientRecord),
    settings,
    today,
  })
  const done = new Set(data.sent ?? [])
  const pending = plan.send.filter((x) => !done.has(x.name))

  const transport = mailer()
  if (!transport) throw new WeeklyRunError(MAILER_MISSING)
  const from = senderAddress()
  let sent = 0
  let failed = 0

  if (pending.length) {
    const renderer = await openPdfRenderer()
    try {
      for (const item of pending) {
        const r = await sendOne(item, { settings, today, testTo: opts.testTo, transport, from, render: renderer.render })
        if (r.status === "sent") sent += 1
        else failed += 1
        await opts.onResult(r)
      }
    } finally {
      await renderer.close()
    }
  }

  return {
    sent,
    failed,
    already: plan.send.length - pending.length,
    skipped: plan.skipped.map((x) => ({ client: x.name, reason: x.skip })),
  }
}

async function sendOne(
  item: WeeklyItem,
  ctx: {
    settings: ReturnType<typeof toSettings>
    today: string
    testTo?: string
    transport: NonNullable<ReturnType<typeof mailer>>
    from: string
    render: (html: string) => Promise<Buffer>
  },
): Promise<WeeklyResult> {
  const { settings, today } = ctx
  const filename = pdfName("Estado de cuenta", item.name, today)
  const mail = statementEmail({
    clientName: item.name,
    rows: item.rows,
    settings,
    today,
    message: defaultStatementMessage({ clientName: item.name, rows: item.rows, today }),
    pdfName: filename,
    assets: CID_ASSETS,
  })
  const to = ctx.testTo ? [ctx.testTo] : item.recipients
  const subject = ctx.testTo ? `[Prueba] ${mail.subject}` : mail.subject
  const base = { client: item.name, recipients: to, subject, amount: item.late > EPS ? item.late : item.due }

  let pdf: Buffer
  try {
    pdf = await ctx.render(
      statementReport({ clientName: item.name, rows: item.rows, payments: item.payments, settings, today, options: { payments: true } }),
    )
  } catch (e) {
    console.error("[estados-semanales] PDF", item.name, e)
    return { ...base, status: "error", error: "No se pudo generar el PDF." }
  }

  try {
    await ctx.transport.sendMail({
      from: { name: senderName(), address: ctx.from },
      to,
      // Copia oculta a la cuenta que envía: queda constancia en su bandeja
      bcc: ctx.testTo ? undefined : ctx.from || undefined,
      replyTo: ctx.from,
      subject,
      html: mail.html,
      text: mail.text,
      attachments: [...logoAttachments(), { filename: safeFilename(filename), content: pdf, contentType: "application/pdf" }],
    })
    return { ...base, status: "sent" }
  } catch (e) {
    console.error("[estados-semanales] SMTP", item.name, e)
    return { ...base, status: "error", error: smtpErrorMessage(e) }
  }
}
