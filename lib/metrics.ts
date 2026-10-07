/* Cálculos del tablero, cobros y clientes. Todo sale de los presupuestos y los
   pagos reales: nada simulado (el gráfico mensual anterior usaba Math.random). */

import type { Budget, Payment } from "./types"
import { addDays, daysBetween, lastMonths, monthKey, num, round2 } from "./format"
import { entityKey, groupNames, type Entity } from "./entities"

export const EPS = 0.005

export const isActive = (b: Budget) => b.status !== "cancelled"

/** Aprobado por el cliente: solo así cuenta como cuenta por cobrar */
export const isApproved = (b: Budget) => !!b.approved_on

/** Enviado al cliente y todavía sin aprobar */
export const isQuote = (b: Budget) => isActive(b) && !isApproved(b)

/** Lo que falta por pagar del presupuesto, esté aprobado o no (0 si está cancelado) */
export const balanceOf = (b: Budget) => (isActive(b) ? Math.max(round2(num(b.total) - num(b.paid_amount)), 0) : 0)

/** Saldo por cobrar en USD: solo de presupuestos aprobados */
export const pendingOf = (b: Budget) => (isApproved(b) ? balanceOf(b) : 0)

export const isOpen = (b: Budget) => pendingOf(b) > EPS

/* ---------- Anticipo (modalidad prepago) ---------- */

export const hasAdvance = (b: Budget) => !!b.advance_type && num(b.advance_value) > 0

/** Monto del anticipo en USD (porcentaje del total o monto fijo) */
export function advanceOf(b: Budget): number {
  if (!hasAdvance(b)) return 0
  const v = num(b.advance_value)
  return round2(b.advance_type === "percent" ? (num(b.total) * Math.min(v, 100)) / 100 : Math.min(v, num(b.total)))
}

/** Lo que falta del anticipo (0 si ya se pagó) */
export const advanceDueOf = (b: Budget) => Math.min(Math.max(round2(advanceOf(b) - num(b.paid_amount)), 0), balanceOf(b))

/** "Anticipo 50 %" o "Anticipo $ 300,00" */
export const advanceLabel = (b: Budget, usd: (n: number) => string) =>
  b.advance_type === "percent"
    ? `Anticipo ${num(b.advance_value).toLocaleString("es-VE", { maximumFractionDigits: 2 })} %`
    : `Anticipo ${usd(num(b.advance_value))}`

/** El plazo corre desde la aprobación (o desde la emisión, si se aprobó antes) */
export const startOf = (b: Budget) => (b.approved_on && b.approved_on > b.date ? b.approved_on : b.date)

export const dueDateOf = (b: Budget, dueDays: number) => addDays(startOf(b), dueDays)

/** Días de atraso respecto al vencimiento (0 si todavía no vence) */
export const daysLate = (b: Budget, dueDays: number, today: string) =>
  Math.max(daysBetween(dueDateOf(b, dueDays), today), 0)

export const isLate = (b: Budget, dueDays: number, today: string) => isOpen(b) && daysLate(b, dueDays, today) > 0

export type PayState = "quote" | "paid" | "partial" | "unpaid" | "cancelled"

export function payState(b: Budget): PayState {
  if (!isActive(b)) return "cancelled"
  if (!isApproved(b)) return "quote"
  if (!isOpen(b)) return "paid"
  return num(b.paid_amount) > EPS ? "partial" : "unpaid"
}

/* ---------- Antigüedad de saldos ---------- */

export const AGING = [
  { id: "current", label: "Por vencer", min: -Infinity, max: 0, color: "#15803D" },
  { id: "d30", label: "1 a 30 días", min: 1, max: 30, color: "#E0A030" },
  { id: "d60", label: "31 a 60 días", min: 31, max: 60, color: "#B45309" },
  { id: "d90", label: "61 a 90 días", min: 61, max: 90, color: "#7C3A0A" },
  { id: "d90p", label: "Más de 90 días", min: 91, max: Infinity, color: "#0E1422" },
] as const

export type AgingId = (typeof AGING)[number]["id"]

export function agingOf(b: Budget, dueDays: number, today: string): AgingId {
  const late = daysBetween(dueDateOf(b, dueDays), today)
  return (AGING.find((a) => late >= a.min && late <= a.max) ?? AGING[0]).id
}

/* ---------- Resumen ---------- */

export interface MonthRow {
  key: string
  budgeted: number
  collected: number
  count: number
}

export interface ClientRow {
  key: string
  name: string
  variants: string[]
  budgeted: number
  paid: number
  pending: number
  overdue: number
  count: number
  openCount: number
  lastBudget: string | null
  lastPayment: string | null
  avgDaysToPay: number | null
  quoteCount: number
  quoteAmount: number
}

export interface ProjectRow {
  key: string
  name: string
  budgeted: number
  count: number
  pending: number
}

export interface Summary {
  /** Aprobados y no cancelados: la base de todos los montos */
  active: Budget[]
  open: Budget[]
  /** Por aprobar: no son cuenta por cobrar */
  quotes: Budget[]
  quoteAmount: number
  /** Aprobados sobre decididos (aprobados + cancelados sin aprobar) en 12 meses */
  approvalRate: number | null
  /** Anticipos aprobados que faltan por cobrar */
  advancesDue: number
  receivable: number
  overdue: number
  overdueCount: number
  aging: Record<AgingId, { amount: number; count: number }>
  months: MonthRow[]
  thisMonth: MonthRow
  prevMonth: MonthRow
  /** El mes anterior hasta el mismo día del mes (comparación justa a mitad de mes) */
  prevMonthToDate: MonthRow
  yearBudgeted: number
  yearCollected: number
  collectionRate: number
  avgTicket: number
  avgDaysToPay: number | null
  medianDaysToPay: number | null
  clients: ClientRow[]
  projects: ProjectRow[]
  methods: { method: string; amount: number; count: number }[]
  cancelled: { count: number; amount: number }
  lastPaymentByBudget: Map<string, string>
}

const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function summarize(budgets: Budget[], payments: Payment[], dueDays: number, today: string): Summary {
  const active = budgets.filter((b) => isActive(b) && isApproved(b))
  const quotes = budgets.filter(isQuote).sort((a, b) => b.date.localeCompare(a.date))
  const open = active.filter(isOpen).sort((a, b) => a.date.localeCompare(b.date))
  const byId = new Map(budgets.map((b) => [b.id, b]))

  // Último pago de cada presupuesto (para días de cobro)
  const lastPaymentByBudget = new Map<string, string>()
  for (const p of payments) {
    const prev = lastPaymentByBudget.get(p.budget_id)
    if (!prev || p.payment_date > prev) lastPaymentByBudget.set(p.budget_id, p.payment_date)
  }

  // Antigüedad
  const aging = Object.fromEntries(AGING.map((a) => [a.id, { amount: 0, count: 0 }])) as Summary["aging"]
  let overdue = 0
  let overdueCount = 0
  for (const b of open) {
    const bucket = aging[agingOf(b, dueDays, today)]
    bucket.amount += pendingOf(b)
    bucket.count += 1
    if (isLate(b, dueDays, today)) {
      overdue += pendingOf(b)
      overdueCount += 1
    }
  }

  // Meses
  const keys = lastMonths(12, today)
  const monthMap = new Map<string, MonthRow>(keys.map((k) => [k, { key: k, budgeted: 0, collected: 0, count: 0 }]))
  const allMonths = new Map<string, MonthRow>()
  const touch = (k: string) => {
    const row = allMonths.get(k) ?? { key: k, budgeted: 0, collected: 0, count: 0 }
    allMonths.set(k, row)
    return row
  }
  for (const b of active) {
    const k = monthKey(b.date)
    const row = touch(k)
    row.budgeted += num(b.total)
    row.count += 1
  }
  for (const p of payments) {
    const b = byId.get(p.budget_id)
    if (b && !isActive(b)) continue
    touch(monthKey(p.payment_date)).collected += num(p.amount)
  }
  allMonths.forEach((row, k) => {
    if (monthMap.has(k)) monthMap.set(k, row)
  })
  const months = keys.map((k) => monthMap.get(k)!)
  const thisMonth = months[months.length - 1]
  const prevMonth = months[months.length - 2]
  const cutDay = today.slice(8, 10)
  const prevMonthToDate: MonthRow = { key: prevMonth.key, budgeted: 0, collected: 0, count: 0 }
  for (const b of active) {
    if (monthKey(b.date) === prevMonth.key && b.date.slice(8, 10) <= cutDay) {
      prevMonthToDate.budgeted += num(b.total)
      prevMonthToDate.count += 1
    }
  }
  for (const p of payments) {
    const b = byId.get(p.budget_id)
    if (b && !isActive(b)) continue
    if (monthKey(p.payment_date) === prevMonth.key && p.payment_date.slice(8, 10) <= cutDay) prevMonthToDate.collected += num(p.amount)
  }
  const year = today.slice(0, 4)
  let yearBudgeted = 0
  let yearCollected = 0
  allMonths.forEach((row, k) => {
    if (k.startsWith(year)) {
      yearBudgeted += row.budgeted
      yearCollected += row.collected
    }
  })

  // Totales
  const totalBudgeted = active.reduce((s, b) => s + num(b.total), 0)
  const totalPaid = active.reduce((s, b) => s + Math.min(num(b.paid_amount), num(b.total)), 0)
  const receivable = open.reduce((s, b) => s + pendingOf(b), 0)

  const yearAgo = addDays(today, -365)
  const recent = active.filter((b) => b.date >= yearAgo)
  const avgTicket = recent.length ? recent.reduce((s, b) => s + num(b.total), 0) / recent.length : 0

  // Días de cobro: de la emisión al último pago, en presupuestos ya pagados
  const daysToPay: number[] = []
  for (const b of active) {
    if (isOpen(b)) continue
    const last = lastPaymentByBudget.get(b.id)
    if (last && last >= yearAgo) daysToPay.push(Math.max(daysBetween(startOf(b), last), 0))
  }
  const avgDaysToPay = daysToPay.length ? daysToPay.reduce((s, d) => s + d, 0) / daysToPay.length : null

  // Por cliente
  const clientNames = groupNames(budgets.map((b) => b.client_name))
  const clientRows = new Map<string, ClientRow & { _days: number[] }>()
  const clientOf = (b: Budget) => {
    const ent = clientNames.get(entityKey(b.client_name)) as Entity
    const row =
      clientRows.get(ent.key) ??
      ({
        key: ent.key,
        name: ent.name,
        variants: ent.variants,
        budgeted: 0,
        paid: 0,
        pending: 0,
        overdue: 0,
        count: 0,
        openCount: 0,
        lastBudget: null,
        lastPayment: null,
        avgDaysToPay: null,
        quoteCount: 0,
        quoteAmount: 0,
        _days: [],
      } as ClientRow & { _days: number[] })
    clientRows.set(ent.key, row)
    return row
  }
  for (const b of active) {
    const row = clientOf(b)
    row.budgeted += num(b.total)
    row.paid += Math.min(num(b.paid_amount), num(b.total))
    row.pending += pendingOf(b)
    row.count += 1
    if (isOpen(b)) row.openCount += 1
    if (isLate(b, dueDays, today)) row.overdue += pendingOf(b)
    if (!row.lastBudget || b.date > row.lastBudget) row.lastBudget = b.date
    const last = lastPaymentByBudget.get(b.id)
    if (last && (!row.lastPayment || last > row.lastPayment)) row.lastPayment = last
    if (!isOpen(b) && last) row._days.push(Math.max(daysBetween(startOf(b), last), 0))
  }
  for (const b of quotes) {
    const row = clientOf(b)
    row.quoteCount += 1
    row.quoteAmount += num(b.total)
  }
  const clients = Array.from(clientRows.values())
    .map(({ _days, ...row }) => ({
      ...row,
      avgDaysToPay: _days.length ? _days.reduce((s, d) => s + d, 0) / _days.length : null,
    }))
    .sort((a, b) => b.pending - a.pending || b.budgeted - a.budgeted)

  // Por proyecto
  const projectNames = groupNames(active.map((b) => b.project_name))
  const projectRows = new Map<string, ProjectRow>()
  for (const b of active) {
    const ent = projectNames.get(entityKey(b.project_name))!
    const row = projectRows.get(ent.key) ?? { key: ent.key, name: ent.name, budgeted: 0, count: 0, pending: 0 }
    row.budgeted += num(b.total)
    row.count += 1
    row.pending += pendingOf(b)
    projectRows.set(ent.key, row)
  }
  const projects = Array.from(projectRows.values()).sort((a, b) => b.budgeted - a.budgeted)

  // Métodos de pago
  const methodMap = new Map<string, { method: string; amount: number; count: number }>()
  for (const p of payments) {
    const row = methodMap.get(p.payment_method) ?? { method: p.payment_method, amount: 0, count: 0 }
    row.amount += num(p.amount)
    row.count += 1
    methodMap.set(p.payment_method, row)
  }

  const cancelledList = budgets.filter((b) => !isActive(b))

  // Tasa de aprobación: de lo emitido en 12 meses y ya decidido
  const decidedApproved = active.filter((b) => b.date >= yearAgo).length
  const rejected = cancelledList.filter((b) => !isApproved(b) && b.date >= yearAgo).length
  const approvalRate = decidedApproved + rejected > 0 ? decidedApproved / (decidedApproved + rejected) : null

  return {
    active,
    open,
    quotes,
    quoteAmount: quotes.reduce((t, b) => t + num(b.total), 0),
    approvalRate,
    advancesDue: open.reduce((t, b) => t + advanceDueOf(b), 0),
    receivable,
    overdue,
    overdueCount,
    aging,
    months,
    thisMonth,
    prevMonth,
    prevMonthToDate,
    yearBudgeted,
    yearCollected,
    collectionRate: totalBudgeted > 0 ? totalPaid / totalBudgeted : 0,
    avgTicket,
    avgDaysToPay,
    medianDaysToPay: median(daysToPay),
    clients,
    projects,
    methods: Array.from(methodMap.values()).sort((a, b) => b.amount - a.amount),
    cancelled: { count: cancelledList.length, amount: cancelledList.reduce((s, b) => s + num(b.total), 0) },
    lastPaymentByBudget,
  }
}

/** Variación porcentual a − b sobre b; null si no hay base */
export const delta = (a: number, b: number) => (b > EPS ? (a - b) / b : null)
