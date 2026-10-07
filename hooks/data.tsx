"use client"

/* Datos del sistema: presupuestos, pagos y ajustes del usuario con sesión.
   Un solo proveedor para toda la app; antes cada pantalla (y el menú lateral)
   montaba su propia copia y descargaba 9 tablas, incluido un logo de 430 KB. */

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { getClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/useAuth"
import { budgetTotal } from "@/lib/budget-math"
import { entityKey } from "@/lib/entities"
import { num, round2, today } from "@/lib/format"
import {
  DEFAULT_SETTINGS,
  type Budget,
  type AdvanceType,
  type BudgetItem,
  type BudgetStatus,
  type Currency,
  type Payment,
  type PaymentStatus,
  type Profile,
  type Settings,
} from "@/lib/types"

const BUDGET_COLUMNS =
  "id,number,client_name,project_name,project_description,total,date,status,items,paid_amount,payment_status,created_at,updated_at"
/** Columnas de la migración 11 (aprobación y anticipo) */
const BUDGET_COLUMNS_NEW = BUDGET_COLUMNS + ",approved_on,advance_type,advance_value"
const SETTINGS_COLUMNS = "id,company_name,payment_phone,payment_bank,payment_account,payment_id_number,contact_email,website,due_days"

export interface BudgetInput {
  number: string
  client_name: string
  project_name: string
  project_description: string
  date: string
  items: BudgetItem[]
  advance_type: AdvanceType | null
  advance_value: number | null
  /** Solo al crear: el cliente ya lo aprobó */
  approved?: boolean
}

export interface PaymentInput {
  budget_id: string
  amount: number
  payment_date: string
  payment_method: string
  reference_number: string
  notes: string
  currency: Currency
  amount_ves: number | null
  exchange_rate: number | null
}

type Result<T = null> = { data: T | null; error: string | null }

/** Fila de la tabla clients (existente): se usa para el correo de cada cliente */
export interface ClientContact {
  id: string
  name: string
  email: string
}

interface DataContext {
  budgets: Budget[]
  payments: Payment[]
  settings: Settings
  profile: Profile | null
  /** Correos de los clientes (tabla clients) */
  contacts: ClientContact[]
  /** Correo guardado para un cliente (se compara por nombre normalizado) */
  emailFor: (clientName: string) => string
  saveClientEmail: (clientName: string, email: string) => Promise<Result>
  loading: boolean
  /** true después de la primera carga completa (presupuestos, pagos y ajustes) */
  loaded: boolean
  error: string | null
  /** true cuando la base ya tiene las columnas de la migración 11 (cobros en Bs, datos del emisor) */
  schemaReady: boolean
  reload: () => Promise<void>
  nextNumber: () => string
  createBudget: (input: BudgetInput) => Promise<Result<Budget>>
  updateBudget: (id: string, input: BudgetInput) => Promise<Result>
  setBudgetCancelled: (budget: Budget, cancelled: boolean) => Promise<Result>
  setBudgetApproved: (budget: Budget, approved: boolean) => Promise<Result>
  registerPayment: (input: PaymentInput) => Promise<Result>
  saveSettings: (settings: Settings) => Promise<Result>
  saveProfile: (fullName: string) => Promise<Result>
}

const Ctx = createContext<DataContext | null>(null)

export const useData = () => {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useData debe usarse dentro de <DataProvider>")
  return ctx
}

function toBudget(row: any): Budget {
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

function toPayment(row: any): Payment {
  return {
    ...row,
    amount: num(row.amount),
    amount_ves: row.amount_ves == null ? null : num(row.amount_ves),
    exchange_rate: row.exchange_rate == null ? null : num(row.exchange_rate),
  }
}

/** Estado coherente con el saldo; la app lo envía siempre, haya o no trigger en la base */
function statusFor(total: number, paid: number, cancelled: boolean): { status: BudgetStatus; payment_status: PaymentStatus } {
  const payment_status: PaymentStatus = paid >= total - 0.005 && total > 0 ? "paid" : paid > 0.005 ? "partial" : "unpaid"
  return { status: cancelled ? "cancelled" : payment_status === "paid" ? "paid" : "pending", payment_status }
}

const message = (error: any, fallback: string) => {
  if (!error) return fallback
  if (error.code === "23505") return "Ya existe un presupuesto con ese número."
  if (error.code === "42703") return "La base de datos todavía no tiene las columnas nuevas (falta aplicar la migración 11)."
  return error.message || fallback
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [contacts, setContacts] = useState<ClientContact[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [schemaReady, setSchemaReady] = useState(false)

  const loadBudgets = useCallback(async () => {
    if (!user) return
    const query = (columns: string) =>
      getClient()
        .from("budgets")
        .select(columns)
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .order("number", { ascending: false })
    let { data, error } = await query(BUDGET_COLUMNS_NEW)
    if (error?.code === "42703") ({ data, error } = await query(BUDGET_COLUMNS))
    if (error) throw error
    setBudgets(((data ?? []) as any[]).map(toBudget))
  }, [user])

  const loadPayments = useCallback(async () => {
    if (!user) return
    const { data, error } = await getClient()
      .from("budget_payments")
      .select("*")
      .eq("user_id", user.id)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
    if (error) throw error
    setPayments((data ?? []).map(toPayment))
  }, [user])

  const loadSettings = useCallback(async () => {
    if (!user) return
    const supabase = getClient()
    const full = await supabase.from("company_settings").select(SETTINGS_COLUMNS).eq("user_id", user.id).maybeSingle()
    if (!full.error) {
      setSchemaReady(true)
      const row: any = full.data ?? {}
      setSettings({
        id: row.id,
        company_name: row.company_name ?? "",
        payment_phone: row.payment_phone ?? DEFAULT_SETTINGS.payment_phone,
        payment_bank: row.payment_bank ?? DEFAULT_SETTINGS.payment_bank,
        payment_account: row.payment_account ?? DEFAULT_SETTINGS.payment_account,
        payment_id_number: row.payment_id_number ?? DEFAULT_SETTINGS.payment_id_number,
        contact_email: row.contact_email ?? DEFAULT_SETTINGS.contact_email,
        website: row.website ?? DEFAULT_SETTINGS.website,
        due_days: num(row.due_days) || DEFAULT_SETTINGS.due_days,
      })
      return
    }
    // Base sin la migración 11: solo existen id y nombre
    setSchemaReady(false)
    const basic = await supabase.from("company_settings").select("id,company_name").eq("user_id", user.id).maybeSingle()
    setSettings({ ...DEFAULT_SETTINGS, id: basic.data?.id, company_name: basic.data?.company_name ?? "" })
  }, [user])

  const loadProfile = useCallback(async () => {
    if (!user) return
    const { data } = await getClient().from("user_profiles").select("id,full_name").eq("user_id", user.id).maybeSingle()
    setProfile(data ?? null)
  }, [user])

  const loadContacts = useCallback(async () => {
    if (!user) return
    const { data } = await getClient().from("clients").select("id,name,email").eq("user_id", user.id)
    setContacts((data ?? []) as ClientContact[])
  }, [user])

  const reload = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      await Promise.all([loadBudgets(), loadPayments(), loadSettings(), loadProfile(), loadContacts()])
      setLoaded(true)
    } catch (e: any) {
      setError(message(e, "No se pudieron cargar los datos."))
    } finally {
      setLoading(false)
    }
  }, [user, loadBudgets, loadPayments, loadSettings, loadProfile, loadContacts])

  useEffect(() => {
    if (user) reload()
  }, [user, reload])

  const emailFor = useCallback(
    (clientName: string) => {
      const key = entityKey(clientName)
      return contacts.find((c) => entityKey(c.name) === key && c.email)?.email ?? ""
    },
    [contacts],
  )

  const saveClientEmail = useCallback<DataContext["saveClientEmail"]>(
    async (clientName, email) => {
      if (!user) return { data: null, error: "Sin sesión." }
      const key = entityKey(clientName)
      const existing = contacts.find((c) => entityKey(c.name) === key)
      const supabase = getClient()
      const { error } = existing
        ? await supabase.from("clients").update({ email: email.trim() }).eq("id", existing.id).eq("user_id", user.id)
        : await supabase.from("clients").insert({ name: clientName.replace(/\s+/g, " ").trim(), email: email.trim(), user_id: user.id })
      if (error) return { data: null, error: message(error, "No se pudo guardar el correo del cliente.") }
      await loadContacts()
      return { data: null, error: null }
    },
    [user, contacts, loadContacts],
  )

  const nextNumber = useCallback(() => {
    const max = budgets.reduce((m, b) => (/^\d+$/.test(b.number) ? Math.max(m, Number(b.number)) : m), 588)
    return String(max + 1).padStart(4, "0")
  }, [budgets])

  const createBudget = useCallback<DataContext["createBudget"]>(
    async (input) => {
      if (!user) return { data: null, error: "Sin sesión." }
      const total = round2(budgetTotal(input.items))
      const { data, error } = await getClient()
        .from("budgets")
        .insert({
          number: input.number.trim(),
          client_name: input.client_name.trim(),
          project_name: input.project_name.trim(),
          project_description: input.project_description.trim() || null,
          date: input.date,
          items: input.items,
          total,
          ...statusFor(total, 0, false),
          ...(schemaReady && {
            approved_on: input.approved ? input.date : null,
            advance_type: input.advance_type,
            advance_value: input.advance_type ? input.advance_value : null,
          }),
          user_id: user.id,
        })
        .select(schemaReady ? BUDGET_COLUMNS_NEW : BUDGET_COLUMNS)
        .single()
      if (error) return { data: null, error: message(error, "No se pudo guardar el presupuesto.") }
      await loadBudgets()
      return { data: toBudget(data), error: null }
    },
    [user, schemaReady, loadBudgets],
  )

  const updateBudget = useCallback<DataContext["updateBudget"]>(
    async (id, input) => {
      if (!user) return { data: null, error: "Sin sesión." }
      const current = budgets.find((b) => b.id === id)
      const total = round2(budgetTotal(input.items))
      const { error } = await getClient()
        .from("budgets")
        .update({
          number: input.number.trim(),
          client_name: input.client_name.trim(),
          project_name: input.project_name.trim(),
          project_description: input.project_description.trim() || null,
          date: input.date,
          items: input.items,
          total,
          ...statusFor(total, current?.paid_amount ?? 0, current?.status === "cancelled"),
          ...(schemaReady && {
            advance_type: input.advance_type,
            advance_value: input.advance_type ? input.advance_value : null,
          }),
        })
        .eq("id", id)
        .eq("user_id", user.id)
      if (error) return { data: null, error: message(error, "No se pudo actualizar el presupuesto.") }
      await loadBudgets()
      return { data: null, error: null }
    },
    [user, budgets, schemaReady, loadBudgets],
  )

  const setBudgetCancelled = useCallback<DataContext["setBudgetCancelled"]>(
    async (budget, cancelled) => {
      if (!user) return { data: null, error: "Sin sesión." }
      const { error } = await getClient()
        .from("budgets")
        .update(statusFor(budget.total, budget.paid_amount, cancelled))
        .eq("id", budget.id)
        .eq("user_id", user.id)
      if (error) return { data: null, error: message(error, "No se pudo cambiar el estado.") }
      await loadBudgets()
      return { data: null, error: null }
    },
    [user, loadBudgets],
  )

  const setBudgetApproved = useCallback<DataContext["setBudgetApproved"]>(
    async (budget, approved) => {
      if (!user) return { data: null, error: "Sin sesión." }
      if (!schemaReady) return { data: null, error: "Para aprobar presupuestos falta aplicar la migración 11 en la base de datos." }
      if (!approved && budget.paid_amount > 0.005)
        return { data: null, error: "Tiene abonos registrados: no se le puede quitar la aprobación." }
      const { error } = await getClient()
        .from("budgets")
        .update({ approved_on: approved ? today() : null })
        .eq("id", budget.id)
        .eq("user_id", user.id)
      if (error) return { data: null, error: message(error, "No se pudo cambiar la aprobación.") }
      await loadBudgets()
      return { data: null, error: null }
    },
    [user, schemaReady, loadBudgets],
  )

  const registerPayment = useCallback<DataContext["registerPayment"]>(
    async (input) => {
      if (!user) return { data: null, error: "Sin sesión." }
      if (input.currency === "VES" && !schemaReady) {
        return {
          data: null,
          error: "Para registrar cobros en bolívares falta aplicar la migración 11 en la base de datos.",
        }
      }
      const row: Record<string, unknown> = {
        budget_id: input.budget_id,
        amount: round2(input.amount),
        payment_date: input.payment_date,
        payment_method: input.payment_method,
        reference_number: input.reference_number.trim() || null,
        notes: input.notes.trim() || null,
        user_id: user.id,
      }
      if (schemaReady) {
        row.currency = input.currency
        row.amount_ves = input.currency === "VES" ? round2(input.amount_ves ?? 0) : null
        row.exchange_rate = input.exchange_rate
      }
      // Cobrar un presupuesto por aprobar lo aprueba (el anticipo es la aprobación)
      const target = budgets.find((b) => b.id === input.budget_id)
      if (schemaReady && target && !target.approved_on) {
        await getClient().from("budgets").update({ approved_on: input.payment_date }).eq("id", target.id).eq("user_id", user.id)
      }
      const { error } = await getClient().from("budget_payments").insert(row)
      if (error) return { data: null, error: message(error, "No se pudo registrar el cobro.") }
      // El trigger de la base actualiza paid_amount del presupuesto
      await Promise.all([loadBudgets(), loadPayments()])
      return { data: null, error: null }
    },
    [user, schemaReady, budgets, loadBudgets, loadPayments],
  )

  const saveSettings = useCallback<DataContext["saveSettings"]>(
    async (next) => {
      if (!user) return { data: null, error: "Sin sesión." }
      if (!schemaReady) {
        return { data: null, error: "Para guardar estos datos falta aplicar la migración 11 en la base de datos." }
      }
      const payload = {
        company_name: next.company_name.trim() || "APEX CONSULTING",
        payment_phone: next.payment_phone.trim(),
        payment_bank: next.payment_bank.trim(),
        payment_account: next.payment_account.replace(/\s+/g, ""),
        payment_id_number: next.payment_id_number.trim(),
        contact_email: next.contact_email.trim(),
        website: next.website.trim(),
        due_days: Math.max(1, Math.round(num(next.due_days)) || 7),
      }
      const supabase = getClient()
      const { error } = settings.id
        ? await supabase.from("company_settings").update(payload).eq("id", settings.id).eq("user_id", user.id)
        : await supabase.from("company_settings").insert({ ...payload, user_id: user.id })
      if (error) return { data: null, error: message(error, "No se pudieron guardar los ajustes.") }
      await loadSettings()
      return { data: null, error: null }
    },
    [user, schemaReady, settings.id, loadSettings],
  )

  const saveProfile = useCallback<DataContext["saveProfile"]>(
    async (fullName) => {
      if (!user) return { data: null, error: "Sin sesión." }
      const supabase = getClient()
      const { error } = profile?.id
        ? await supabase.from("user_profiles").update({ full_name: fullName.trim() || null }).eq("id", profile.id)
        : await supabase.from("user_profiles").insert({ user_id: user.id, full_name: fullName.trim() || null })
      if (error) return { data: null, error: message(error, "No se pudo guardar el perfil.") }
      await loadProfile()
      return { data: null, error: null }
    },
    [user, profile?.id, loadProfile],
  )

  const value = useMemo<DataContext>(
    () => ({
      budgets,
      payments,
      settings,
      profile,
      contacts,
      emailFor,
      saveClientEmail,
      loading,
      loaded,
      error,
      schemaReady,
      reload,
      nextNumber,
      createBudget,
      updateBudget,
      setBudgetCancelled,
      setBudgetApproved,
      registerPayment,
      saveSettings,
      saveProfile,
    }),
    [
      budgets,
      payments,
      settings,
      profile,
      contacts,
      emailFor,
      saveClientEmail,
      loading,
      loaded,
      error,
      schemaReady,
      reload,
      nextNumber,
      createBudget,
      updateBudget,
      setBudgetCancelled,
      setBudgetApproved,
      registerPayment,
      saveSettings,
      saveProfile,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
