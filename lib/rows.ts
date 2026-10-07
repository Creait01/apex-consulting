/* Filas de la base → tipos de la app. Lo usan el navegador (DataProvider) y el
   servidor (envío automático semanal), así que no depende de nada del cliente. */

import { num } from "./format"
import { entityKey } from "./entities"
import {
  DEFAULT_SETTINGS,
  type Budget,
  type ClientRecord,
  type Contact,
  type EmailLogEntry,
  type Payment,
  type Settings,
  type StatementScope,
} from "./types"

export const BUDGET_COLUMNS =
  "id,number,client_name,project_name,project_description,total,date,status,items,paid_amount,payment_status,created_at,updated_at"
/** Columnas de la migración 11 (aprobación y anticipo) */
export const BUDGET_COLUMNS_NEW = BUDGET_COLUMNS + ",approved_on,advance_type,advance_value"
export const SETTINGS_COLUMNS = "id,company_name,payment_phone,payment_bank,payment_account,payment_id_number,contact_email,website,due_days"
/** Columnas de la migración 12 (envío automático semanal) */
export const SETTINGS_COLUMNS_AUTO = SETTINGS_COLUMNS + ",statement_auto,statement_weekday,statement_hour,statement_scope,app_url"
export const CLIENT_COLUMNS = "id,name,email"
export const CLIENT_COLUMNS_NEW = CLIENT_COLUMNS + ",contacts,auto_statement"

export function toBudget(row: any): Budget {
  // Sin la migración 11 no hay aprobación: todo lo no cancelado cuenta como aprobado (como antes)
  const legacy = !("approved_on" in row)
  return {
    ...row,
    project_description: row.project_description ?? null,
    total: num(row.total),
    paid_amount: num(row.paid_amount),
    items: Array.isArray(row.items) ? row.items : [],
    approved_on: legacy ? (row.status === "cancelled" ? null : row.date) : row.approved_on ?? null,
    advance_type: row.advance_type ?? null,
    advance_value: row.advance_value == null ? null : num(row.advance_value),
  }
}

export function toPayment(row: any): Payment {
  return {
    ...row,
    amount: num(row.amount),
    amount_ves: row.amount_ves == null ? null : num(row.amount_ves),
    exchange_rate: row.exchange_rate == null ? null : num(row.exchange_rate),
  }
}

const int = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback
}

export function toSettings(row: any): Settings {
  const r = row ?? {}
  const d = DEFAULT_SETTINGS
  return {
    id: r.id,
    company_name: r.company_name ?? "",
    payment_phone: r.payment_phone ?? d.payment_phone,
    payment_bank: r.payment_bank ?? d.payment_bank,
    payment_account: r.payment_account ?? d.payment_account,
    payment_id_number: r.payment_id_number ?? d.payment_id_number,
    contact_email: r.contact_email ?? d.contact_email,
    website: r.website ?? d.website,
    due_days: num(r.due_days) || d.due_days,
    statement_auto: r.statement_auto === true,
    statement_weekday: int(r.statement_weekday, d.statement_weekday, 0, 6),
    statement_hour: int(r.statement_hour, d.statement_hour, 0, 23),
    statement_scope: (r.statement_scope === "open" ? "open" : "late") as StatementScope,
    app_url: r.app_url ?? "",
  }
}

/* ---------- Contactos ---------- */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** "a@x.com, b@y.com; c@z.com" → lista sin vacíos */
export const splitEmails = (v: string | null | undefined) =>
  String(v ?? "")
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)

/** Lista limpia: correos en minúscula, válidos y sin repetir */
export function cleanContacts(list: Contact[]): Contact[] {
  const seen = new Set<string>()
  const out: Contact[] = []
  for (const c of list) {
    const email = String(c?.email ?? "").trim().toLowerCase()
    if (!EMAIL_RE.test(email) || seen.has(email)) continue
    seen.add(email)
    out.push({ name: String(c?.name ?? "").replace(/\s+/g, " ").trim(), email })
  }
  return out
}

export function toClientRecord(row: any): ClientRecord {
  // Sin la migración 12 solo existe el correo único de siempre
  const contacts = Array.isArray(row.contacts) ? row.contacts : row.email ? [{ name: "", email: row.email }] : []
  return {
    id: row.id,
    name: row.name ?? "",
    email: row.email ?? "",
    contacts: cleanContacts(contacts),
    auto_statement: row.auto_statement !== false,
  }
}

/** La ficha del cliente (por nombre normalizado: "A2 CORPORACION C.A" = "A2 CORPORACION, C.A") */
export const clientRecordFor = (clients: ClientRecord[], name: string) => {
  const key = entityKey(name)
  return clients.find((c) => entityKey(c.name) === key) ?? null
}

export function toEmailLog(row: any): EmailLogEntry {
  return {
    ...row,
    recipients: Array.isArray(row.recipients) ? row.recipients : [],
    amount: row.amount == null ? null : num(row.amount),
  }
}
