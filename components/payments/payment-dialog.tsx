"use client"

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { Modal } from "@/components/ui/modal"
import { Field, Segmented, useToast } from "@/components/ui/kit"
import { useData } from "@/hooks/data"
import { useRate } from "@/hooks/rate"
import { dateFmt, parseAmount, rateFmt, round2, toInput, today, usd, ves } from "@/lib/format"
import { advanceDueOf, advanceLabel, balanceOf, hasAdvance, isOpen, isQuote } from "@/lib/metrics"
import { entityKey, groupNames } from "@/lib/entities"
import { PAYMENT_METHODS, type Currency } from "@/lib/types"

const Ctx = createContext<(budgetId?: string) => void>(() => {})

/** Abre el diálogo de registrar cobro desde cualquier pantalla */
export const usePaymentDialog = () => useContext(Ctx)

export function PaymentDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [budgetId, setBudgetId] = useState<string | undefined>()
  const show = useCallback((id?: string) => {
    setBudgetId(id)
    setOpen(true)
  }, [])
  return (
    <Ctx.Provider value={show}>
      {children}
      {open && <PaymentDialog initialBudgetId={budgetId} onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  )
}

function PaymentDialog({ initialBudgetId, onClose }: { initialBudgetId?: string; onClose: () => void }) {
  const { budgets, registerPayment, schemaReady } = useData()
  const { rateOn } = useRate()
  const toast = useToast()

  const [budgetId, setBudgetId] = useState(initialBudgetId ?? "")
  const [currency, setCurrency] = useState<Currency>(schemaReady ? "VES" : "USD")
  const [date, setDate] = useState(today())
  const [rateText, setRateText] = useState("")
  const [rateTouched, setRateTouched] = useState(false)
  const [amountText, setAmountText] = useState("")
  const [method, setMethod] = useState("transfer")
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = useMemo(() => budgets.filter(isOpen), [budgets])
  const groups = useMemo(() => {
    const names = groupNames(open.map((b) => b.client_name))
    const map = new Map<string, typeof open>()
    for (const b of [...open].sort((a, z) => a.number.localeCompare(z.number))) {
      const name = names.get(entityKey(b.client_name))!.name
      map.set(name, [...(map.get(name) ?? []), b])
    }
    return Array.from(map.entries()).sort((a, z) => a[0].localeCompare(z[0]))
  }, [open])
  // Por aprobar: se pueden cobrar (p. ej. el anticipo) y quedan aprobados al registrar el cobro
  const quotes = useMemo(
    () => (schemaReady ? budgets.filter(isQuote).sort((a, z) => a.number.localeCompare(z.number)) : []),
    [budgets, schemaReady],
  )

  const budget = budgets.find((b) => b.id === budgetId)
  const pending = budget ? balanceOf(budget) : 0
  const advanceDue = budget && hasAdvance(budget) ? advanceDueOf(budget) : 0

  // La tasa sigue a la fecha del pago, salvo que se haya escrito a mano
  useEffect(() => {
    if (rateTouched) return
    const r = rateOn(date)
    setRateText(r ? toInput(r) : "")
  }, [date, rateOn, rateTouched])

  const rate = parseAmount(rateText)
  const typed = parseAmount(amountText)
  let usdAmount = currency === "VES" ? (rate > 0 ? round2(typed / rate) : 0) : round2(typed)
  // Un pago en Bs por el saldo completo puede diferir en un céntimo por redondeo
  if (budget && Math.abs(usdAmount - pending) <= 0.01) usdAmount = pending
  else if (advanceDue > 0 && Math.abs(usdAmount - advanceDue) <= 0.01) usdAmount = advanceDue

  const fill = (usdValue: number) => {
    if (!budget) return
    if (currency === "VES") {
      if (rate > 0) setAmountText(toInput(usdValue * rate))
    } else setAmountText(toInput(usdValue))
  }
  const fillPending = () => fill(pending)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!budget) return setError("Elige el presupuesto que se está pagando.")
    if (currency === "VES" && !(rate > 0)) return setError("Indica la tasa del día del pago.")
    if (!(usdAmount > 0)) return setError("Indica el monto recibido.")
    if (usdAmount > pending + 0.01) return setError(`El abono supera el saldo del presupuesto (${usd(pending)}).`)

    setSaving(true)
    const { error } = await registerPayment({
      budget_id: budget.id,
      amount: usdAmount,
      payment_date: date,
      payment_method: method,
      reference_number: reference,
      notes,
      currency,
      amount_ves: currency === "VES" ? round2(typed) : null,
      exchange_rate: currency === "VES" ? rate : rateOn(date),
    })
    setSaving(false)
    if (error) return setError(error)
    toast(
      `Cobro registrado en el ${budget.number}: ${usd(usdAmount)}${currency === "VES" ? ` (${ves(typed)})` : ""}.`,
    )
    onClose()
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Registrar cobro"
      description="Abona al saldo de un presupuesto. Si te pagaron en bolívares, se guarda el monto en Bs y la tasa del día."
      className="w-[min(94vw,620px)]"
      footer={
        <>
          <button type="button" className="btn-paper" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="payment-form" className="btn-red" disabled={saving}>
            {saving ? "Guardando…" : "Registrar cobro"}
          </button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="grid gap-4">
        <Field label="Presupuesto" htmlFor="pay-budget">
          <select id="pay-budget" className="input" value={budgetId} onChange={(e) => setBudgetId(e.target.value)} required>
            <option value="">Elige un presupuesto con saldo…</option>
            {groups.map(([client, list]) => (
              <optgroup key={client} label={client}>
                {list.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.number} · {b.project_name} — saldo {usd(balanceOf(b))}
                  </option>
                ))}
              </optgroup>
            ))}
            {quotes.length > 0 && (
              <optgroup label="Por aprobar (se aprueba al registrar el cobro)">
                {quotes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.number} · {b.project_name} — {usd(balanceOf(b))}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>

        {budget && (
          <div className="grid grid-cols-3 border-2 border-ink bg-white">
            {[
              ["Total", usd(budget.total)],
              ["Abonado", usd(budget.paid_amount)],
              ["Saldo", usd(pending)],
            ].map(([k, v], i) => (
              <div key={k} className={i ? "border-l-2 border-ink px-3 py-2.5" : "px-3 py-2.5"}>
                <div className="text-[12px] font-semibold text-ink-2">{k}</div>
                <div className="display mt-1 text-[19px]">{v}</div>
              </div>
            ))}
            {rate > 0 && (
              <div className="col-span-3 border-t-2 border-ink bg-paper px-3 py-2 text-[13px] text-ink-2">
                Saldo en bolívares a {rateFmt(rate)}: <b className="text-ink">{ves(pending * rate)}</b>
              </div>
            )}
            {advanceDue > 0 && (
              <div className="col-span-3 flex items-center justify-between gap-3 border-t-2 border-ink bg-amber-bg px-3 py-2 text-[13px]">
                <span>
                  {advanceLabel(budget, usd)} pendiente: <b>{usd(advanceDue)}</b>
                  {rate > 0 && <span className="text-ink-2"> · {ves(advanceDue * rate)}</span>}
                </span>
                <button type="button" className="btn-paper btn-sm" onClick={() => fill(advanceDue)}>
                  Cobrar anticipo
                </button>
              </div>
            )}
            {isQuote(budget) && (
              <div className="col-span-3 border-t-2 border-dashed border-ink px-3 py-2 text-[13px] text-ink-2">
                Está <b className="text-ink">por aprobar</b>: al registrar este cobro queda aprobado.
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <span className="field-label">Moneda recibida</span>
            <Segmented
              value={currency}
              onChange={(v) => {
                setCurrency(v)
                setAmountText("")
              }}
              options={[
                { value: "VES", label: "Bolívares" },
                { value: "USD", label: "Dólares" },
              ]}
            />
          </div>
          <Field label="Fecha del pago" htmlFor="pay-date" className="w-[170px]">
            <input id="pay-date" type="date" className="input" value={date} max={today()} onChange={(e) => setDate(e.target.value)} required />
          </Field>
        </div>
        {!schemaReady && (
          <p className="border-2 border-amber bg-amber-bg px-3 py-2 text-[13px] font-semibold text-amber">
            Los cobros en bolívares se activan al aplicar la migración 11 en la base de datos. Mientras tanto, regístralo en dólares.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {currency === "VES" && (
            <Field
              label="Tasa (Bs por $)"
              htmlFor="pay-rate"
              hint={rateTouched ? "Tasa escrita a mano" : rateOn(date) ? `BCV vigente el ${dateFmt(date)}` : "Escribe la tasa usada"}
            >
              <input
                id="pay-rate"
                className="input num"
                inputMode="decimal"
                value={rateText}
                onChange={(e) => {
                  setRateText(e.target.value)
                  setRateTouched(true)
                }}
                placeholder="871,37"
              />
            </Field>
          )}
          <Field
            label={currency === "VES" ? "Monto recibido (Bs)" : "Monto recibido ($)"}
            htmlFor="pay-amount"
            className={currency === "USD" ? "sm:col-span-2" : undefined}
            hint={
              currency === "VES" && usdAmount > 0 ? (
                <>
                  Abona <b className="text-ink">{usd(usdAmount)}</b> al presupuesto
                </>
              ) : undefined
            }
          >
            <div className="flex gap-2">
              <input
                id="pay-amount"
                className="input num"
                inputMode="decimal"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="0,00"
                required
              />
              <button type="button" className="btn-paper shrink-0" onClick={fillPending} disabled={!budget}>
                Saldo completo
              </button>
            </div>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Método" htmlFor="pay-method">
            <select id="pay-method" className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Referencia" htmlFor="pay-ref">
            <input id="pay-ref" className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Nº de operación" />
          </Field>
        </div>
        <Field label="Notas" htmlFor="pay-notes">
          <textarea id="pay-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>

        {error && <p className="border-2 border-amber bg-amber-bg px-3 py-2 text-[13.5px] font-semibold text-amber">{error}</p>}
      </form>
    </Modal>
  )
}
