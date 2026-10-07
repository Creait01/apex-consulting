"use client"

import type { Budget, Payment, Settings } from "./types"
import { AGING, agingOf, isOpen, pendingOf, type AgingId, type Summary } from "./metrics"
import { entityKey, groupNames } from "./entities"
import {
  budgetReport,
  collectionsReport,
  receivablesReport,
  statementReport,
  type BudgetDoc,
  type CollectionRow,
  type ReceivableClient,
  type StatementInput,
} from "./reports"
import { printHTML } from "./print"
import { dateFmt } from "./format"

type Rate = { rate: number | null; rateDate: string | null }

export function printBudget(doc: BudgetDoc, settings: Settings) {
  printHTML(budgetReport(doc, settings), `Presupuesto ${doc.number} - ${doc.project_name || doc.client_name}`)
}

export function printStatement(input: StatementInput) {
  printHTML(statementReport(input), `Estado de cuenta - ${input.clientName} - ${dateFmt(input.today).replace(/\//g, "-")}`)
}

export function receivableClients(budgets: Budget[], summary: Summary, dueDays: number, today: string): ReceivableClient[] {
  const names = groupNames(budgets.map((b) => b.client_name))
  const map = new Map<string, ReceivableClient>()
  for (const b of budgets.filter(isOpen)) {
    const key = entityKey(b.client_name)
    const row =
      map.get(key) ??
      ({
        name: names.get(key)!.name,
        budgets: [],
        aging: Object.fromEntries(AGING.map((a) => [a.id, 0])) as Record<AgingId, number>,
        pending: 0,
        overdue: 0,
        lastPayment: summary.clients.find((c) => c.key === key)?.lastPayment ?? null,
      } as ReceivableClient)
    const p = pendingOf(b)
    row.budgets.push(b)
    row.pending += p
    const bucket = agingOf(b, dueDays, today)
    row.aging[bucket] += p
    if (bucket !== "current") row.overdue += p
    map.set(key, row)
  }
  return Array.from(map.values())
    .map((c) => ({ ...c, budgets: c.budgets.sort((a, b) => a.date.localeCompare(b.date)) }))
    .sort((a, b) => b.pending - a.pending)
}

export function printReceivables(budgets: Budget[], summary: Summary, settings: Settings, today: string, rate: Rate) {
  const html = receivablesReport({
    clients: receivableClients(budgets, summary, settings.due_days, today),
    aging: summary.aging,
    receivable: summary.receivable,
    overdue: summary.overdue,
    settings,
    today,
    rate: rate.rate,
    rateDate: rate.rateDate,
  })
  printHTML(html, `Cuentas por cobrar - ${dateFmt(today).replace(/\//g, "-")}`)
}

export function collectionRows(payments: Payment[], budgets: Budget[], rateOn: (d: string) => number | null): CollectionRow[] {
  const byId = new Map(budgets.map((b) => [b.id, b]))
  return payments.map((p) => {
    const inVes = p.currency === "VES" && p.amount_ves != null
    const rate = p.exchange_rate ?? rateOn(p.payment_date)
    return {
      payment: p,
      budget: byId.get(p.budget_id),
      bs: inVes ? p.amount_ves! : rate ? p.amount * rate : null,
      bsIsReference: !inVes,
      rate,
    }
  })
}

export function printCollections(rows: CollectionRow[], period: string, settings: Settings, today: string) {
  printHTML(collectionsReport({ rows, period, settings, today }), `Cobros - ${period}`)
}
