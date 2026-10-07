import type { DiscountType } from "./budget-math"

export interface BudgetItem {
  id: string
  category: string
  description: string
  quantity: number
  rate: number
  unit: string
  /* Descuento por ítem. Opcionales: los presupuestos anteriores no los traen. */
  discount_type?: DiscountType
  discount_value?: number
}

export type BudgetStatus = "pending" | "paid" | "overdue" | "cancelled"
export type AdvanceType = "percent" | "amount"
export type PaymentStatus = "unpaid" | "partial" | "paid"

export interface Budget {
  id: string
  number: string
  client_name: string
  project_name: string
  project_description: string | null
  total: number
  date: string
  status: BudgetStatus
  items: BudgetItem[]
  paid_amount: number
  payment_status: PaymentStatus
  created_at: string
  updated_at: string
  /** Día en que el cliente lo aprobó; null = por aprobar (no es cuenta por cobrar) */
  approved_on: string | null
  /** Anticipo (prepago): porcentaje del total o monto fijo en USD; null = todo al vencer */
  advance_type: AdvanceType | null
  advance_value: number | null
}

export type Currency = "USD" | "VES"

export interface Payment {
  id: string
  budget_id: string
  /** Lo abonado al presupuesto, en USD */
  amount: number
  payment_date: string
  payment_method: string
  reference_number: string | null
  notes: string | null
  created_at: string
  /* Columnas de la migración 11; pueden no existir todavía */
  currency?: Currency
  amount_ves?: number | null
  exchange_rate?: number | null
}

export interface Settings {
  id?: string
  company_name: string
  payment_phone: string
  payment_bank: string
  /** Número de cuenta bancaria para transferencias (20 dígitos) */
  payment_account: string
  payment_id_number: string
  contact_email: string
  website: string
  due_days: number
}

export interface Profile {
  id?: string
  full_name: string | null
}

export const PAYMENT_METHODS: Record<string, string> = {
  transfer: "Transferencia",
  mobile: "Pago móvil",
  cash: "Efectivo",
  zelle: "Zelle",
  card: "Tarjeta",
  check: "Cheque",
  paypal: "PayPal",
  other: "Otro",
}

export const methodLabel = (m: string) => PAYMENT_METHODS[m] ?? m

/** Valores con los que se imprimían los PDF antes de que fueran editables */
export const DEFAULT_SETTINGS: Settings = {
  company_name: "",
  payment_phone: "04242864675",
  payment_bank: "Banesco",
  payment_account: "01340946350001464332",
  payment_id_number: "V-26682963",
  contact_email: "edwin.dev.21114@gmail.com",
  website: "apexconsulting-it.site",
  due_days: 7,
}
