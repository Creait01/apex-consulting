/* Estado de cuenta semanal: qué se le cobra a cada cliente, a quién le llega y
   cuándo sale. Lo comparten la vista previa de Ajustes y el envío automático
   del servidor, así que lo que se ve en pantalla es lo que se manda. */

import { EPS, advanceDueOf, dueDateOf, hasAdvance, isLate, isOpen, pendingOf, startOf } from "./metrics"
import { entityKey, groupNames } from "./entities"
import { daysBetween, num, plain, usd } from "./format"
import { clientRecordFor } from "./rows"
import type { ChargeKind, StatementRow } from "./reports"
import type { Budget, ClientRecord, Payment, Settings } from "./types"

/** Lo sugerido: el anticipo si el presupuesto lo tiene y falta pagarlo; si no, el saldo */
export const suggestedKind = (b: Budget): ChargeKind => (hasAdvance(b) && advanceDueOf(b) > EPS ? "anticipo" : "saldo")

export const anticipoLabel = (b: Budget) =>
  b.advance_type === "amount" ? `Anticipo ${usd(num(b.advance_value))}` : `Anticipo ${plain(num(b.advance_value))} %`

export function suggestedRow(b: Budget, dueDays: number, today: string): StatementRow {
  const kind = suggestedKind(b)
  return {
    budget: b,
    due: kind === "anticipo" ? advanceDueOf(b) : pendingOf(b),
    kind,
    label: kind === "anticipo" ? anticipoLabel(b) : "Saldo",
    late: isLate(b, dueDays, today),
    lateDays: Math.max(daysBetween(dueDateOf(b, dueDays), today), 0),
  }
}

export interface WeeklyItem {
  key: string
  name: string
  rows: StatementRow[]
  /** Abonos de los presupuestos incluidos (van en el PDF) */
  payments: Payment[]
  due: number
  late: number
  recipients: string[]
  /** Por qué no se le envía: sin correo o desactivado en su ficha */
  skip: "sin-correo" | "desactivado" | null
}

/** Clientes que reciben el estado de cuenta semanal (y los que quedan fuera, con el motivo) */
export function weeklyPlan(i: { budgets: Budget[]; payments: Payment[]; clients: ClientRecord[]; settings: Settings; today: string }) {
  const { settings: s, today } = i
  const open = i.budgets.filter(isOpen)
  const names = groupNames(open.map((b) => b.client_name))
  const byClient = new Map<string, Budget[]>()
  for (const b of open) {
    const key = entityKey(b.client_name)
    byClient.set(key, [...(byClient.get(key) ?? []), b])
  }

  const items: WeeklyItem[] = []
  byClient.forEach((list, key) => {
    const rows = list.sort((a, b) => startOf(a).localeCompare(startOf(b))).map((b) => suggestedRow(b, s.due_days, today))
    const due = rows.reduce((t, r) => t + r.due, 0)
    const late = rows.reduce((t, r) => t + (r.late ? r.due : 0), 0)
    // Solo con vencido, o todos los que tienen algo que pagar
    if (s.statement_scope === "late" ? late <= EPS : due <= EPS) return
    const name = names.get(key)?.name ?? key
    const record = clientRecordFor(i.clients, name)
    const recipients = (record?.contacts ?? []).map((c) => c.email)
    const ids = new Set(list.map((b) => b.id))
    items.push({
      key,
      name,
      rows,
      payments: i.payments.filter((p) => ids.has(p.budget_id)).sort((a, b) => a.payment_date.localeCompare(b.payment_date)),
      due,
      late,
      recipients,
      skip: record && !record.auto_statement ? "desactivado" : recipients.length === 0 ? "sin-correo" : null,
    })
  })
  items.sort((a, b) => b.late - a.late || b.due - a.due)
  return { send: items.filter((x) => !x.skip), skipped: items.filter((x) => x.skip) }
}

/* ---------- Cuándo sale ---------- */

/** Caracas está en UTC−4 todo el año */
const CARACAS_OFFSET_MS = -4 * 3_600_000

/** "AAAA-MM-DD" de hoy en Caracas (el servidor corre en UTC) */
export const caracasToday = (now = new Date()) => new Date(now.getTime() + CARACAS_OFFSET_MS).toISOString().slice(0, 10)

/** Próximo envío (instante real) según el día y la hora de Caracas configurados.
    El programador revisa cada hora en punto: si hoy es el día, ya pasó la hora y
    todavía no salió (doneToday = false), sale en la próxima hora en punto. */
export function nextWeeklyRun(
  s: Pick<Settings, "statement_weekday" | "statement_hour">,
  opts: { now?: Date; doneToday?: boolean } = {},
): Date {
  const local = new Date((opts.now ?? new Date()).getTime() + CARACAS_OFFSET_MS)
  const [y, m, d, h] = [local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), local.getUTCHours()]
  let add = (s.statement_weekday - local.getUTCDay() + 7) % 7
  if (add === 0 && h >= s.statement_hour) {
    if (!opts.doneToday) return new Date(Date.UTC(y, m, d, h + 1) - CARACAS_OFFSET_MS)
    add = 7
  }
  return new Date(Date.UTC(y, m, d + add, s.statement_hour) - CARACAS_OFFSET_MS)
}

/** "lunes 12 de octubre, 8:00 a. m." en hora de Caracas */
export function caracasLabel(d: Date) {
  return d.toLocaleString("es-VE", {
    timeZone: "America/Caracas",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  })
}

export const hourLabel = (h: number) => {
  const h12 = h % 12 || 12
  return `${h12}:00 ${h < 12 ? "a. m." : "p. m."}`
}
