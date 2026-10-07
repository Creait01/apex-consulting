"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Printer, Trash2 } from "lucide-react"
import { useData } from "@/hooks/data"
import { useRate } from "@/hooks/rate"
import { Field, PageHeader, Panel, Segmented, useToast } from "@/components/ui/kit"
import { DocPreview } from "./preview"
import { budgetReport } from "@/lib/reports"
import { printBudget } from "@/lib/report-actions"
import {
  budgetDiscount,
  budgetSubtotal,
  budgetTotal,
  itemDiscount,
  itemNet,
  type DiscountType,
} from "@/lib/budget-math"
import { dateFmt, parseAmount, today, toInput, usd, ves } from "@/lib/format"
import { groupNames } from "@/lib/entities"
import type { AdvanceType, Budget, BudgetItem } from "@/lib/types"

/* Ítem en edición: los números se guardan como texto mientras se escriben */
interface Draft {
  id: string
  category: string
  description: string
  quantity: string
  unit: string
  rate: string
  discount_type: DiscountType
  discount_value: string
}

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

const toDraft = (i: BudgetItem): Draft => ({
  id: i.id || uid(),
  category: i.category ?? "",
  description: i.description ?? "",
  quantity: toInput(Number(i.quantity)) || "",
  unit: i.unit ?? "",
  rate: toInput(Number(i.rate)) || "",
  discount_type: i.discount_type ?? "percent",
  discount_value: toInput(Number(i.discount_value ?? 0)),
})

const toItem = (d: Draft): BudgetItem => {
  const item: BudgetItem = {
    id: d.id,
    category: d.category.trim(),
    description: d.description.trim(),
    quantity: parseAmount(d.quantity),
    unit: d.unit.trim(),
    rate: parseAmount(d.rate),
  }
  const dv = parseAmount(d.discount_value)
  if (dv > 0) {
    item.discount_type = d.discount_type
    item.discount_value = dv
  }
  return item
}

const blank = (): Draft => ({
  id: uid(),
  category: "Horas de desarrollo",
  description: "",
  quantity: "",
  unit: "Horas",
  rate: "",
  discount_type: "percent",
  discount_value: "",
})

export function BudgetEditor({ budget, source }: { budget?: Budget; source?: Budget }) {
  const router = useRouter()
  const toast = useToast()
  const { budgets, settings, nextNumber, createBudget, updateBudget, schemaReady } = useData()
  const { rate, rateDate } = useRate()
  const base = budget ?? source
  const editing = !!budget

  const [number, setNumber] = useState(budget?.number ?? nextNumber())
  const [date, setDate] = useState(budget?.date ?? today())
  const [client, setClient] = useState(base?.client_name.trim() ?? "")
  const [project, setProject] = useState(base?.project_name.trim() ?? "")
  const [description, setDescription] = useState(base?.project_description ?? "")
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    base?.items.length ? base.items.map((i) => ({ ...toDraft(i), id: source ? uid() : i.id || uid() })) : [blank()],
  )
  // Forma de pago: todo al vencer o con anticipo (50 % por defecto)
  const [advanceOn, setAdvanceOn] = useState(!!base?.advance_type)
  const [advanceType, setAdvanceType] = useState<AdvanceType>(base?.advance_type ?? "percent")
  const [advanceText, setAdvanceText] = useState(base?.advance_value ? toInput(base.advance_value) : "50")
  const [approved, setApproved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  // Avisar antes de salir con cambios sin guardar
  useEffect(() => {
    if (!dirty) return
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onLeave)
    return () => window.removeEventListener("beforeunload", onLeave)
  }, [dirty])

  const touch = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setDirty(true)
  }

  const clientOptions = useMemo(
    () => Array.from(groupNames(budgets.map((b) => b.client_name)).values()).map((e) => e.name).sort(),
    [budgets],
  )
  const projectOptions = useMemo(
    () => Array.from(groupNames(budgets.map((b) => b.project_name)).values()).map((e) => e.name).sort(),
    [budgets],
  )
  const categoryOptions = useMemo(
    () => Array.from(new Set(budgets.flatMap((b) => b.items.map((i) => (i.category ?? "").trim())).filter(Boolean))).sort(),
    [budgets],
  )

  const items = drafts.map(toItem)
  const subtotal = budgetSubtotal(items)
  const discount = budgetDiscount(items)
  const total = budgetTotal(items)
  const paid = budget?.paid_amount ?? 0

  const advanceValue = parseAmount(advanceText)
  const advance = {
    advance_type: advanceOn && advanceValue > 0 ? advanceType : null,
    advance_value: advanceOn && advanceValue > 0 ? advanceValue : null,
  }
  const advanceAmount = advance.advance_type === "percent" ? (total * Math.min(advanceValue, 100)) / 100 : advance.advance_type ? Math.min(advanceValue, total) : 0

  const doc = {
    number,
    date,
    client_name: client,
    project_name: project,
    project_description: description,
    items,
    ...advance,
    approved_on: budget?.approved_on ?? (approved ? date : null),
  }
  const html = budgetReport(doc, settings)

  const setDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)))
    setDirty(true)
  }

  const numberTaken = budgets.some((b) => b.number === number.trim() && b.id !== budget?.id)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const valid = items.filter((i) => i.description && i.quantity > 0)
    if (!number.trim()) return setError("Indica el número del presupuesto.")
    if (numberTaken) return setError(`Ya existe un presupuesto con el número ${number}.`)
    if (!client.trim() || !project.trim()) return setError("Indica el cliente y el proyecto.")
    if (valid.length === 0) return setError("Agrega al menos un ítem con descripción y cantidad.")
    if (valid.length !== items.length) return setError("Hay ítems sin descripción o sin cantidad: complétalos o quítalos.")
    if (editing && total < paid - 0.005)
      return setError(`El total (${usd(total)}) quedaría por debajo de lo ya abonado (${usd(paid)}).`)

    setSaving(true)
    if (advanceOn && !(advanceValue > 0)) return setError("Indica el anticipo o elige \"Al vencer\".")
    if (advance.advance_type === "percent" && advanceValue > 100) return setError("El anticipo no puede pasar del 100 %.")
    const input = { number, client_name: client, project_name: project, project_description: description, date, items, ...advance, approved }
    if (editing) {
      const { error } = await updateBudget(budget!.id, input)
      setSaving(false)
      if (error) return setError(error)
      setDirty(false)
      toast(`Presupuesto ${number} actualizado.`)
      router.push(`/presupuestos/${budget!.id}`)
    } else {
      const { data, error } = await createBudget(input)
      setSaving(false)
      if (error || !data) return setError(error ?? "No se pudo guardar.")
      setDirty(false)
      toast(`Presupuesto ${data.number} guardado.`)
      router.push(`/presupuestos/${data.id}?enviar=1`)
    }
  }

  return (
    <form onSubmit={save}>
      <PageHeader
        title={editing ? `Editar ${budget!.number}` : "Nuevo presupuesto"}
        tail={editing ? undefined : source ? `copia del ${source.number}.` : undefined}
        meta={
          editing
            ? `${budget!.client_name} · ${budget!.project_name} · ${
                budget!.approved_on ? `aprobado el ${dateFmt(budget!.approved_on)}: conserva la aprobación y sus abonos` : "por aprobar"
              }`
            : "Lo que escribes es lo que se imprime en el presupuesto."
        }
        actions={
          <>
            <button type="button" className="btn-paper" onClick={() => router.back()}>
              Volver
            </button>
            <button type="button" className="btn-paper" onClick={() => printBudget(doc, settings)}>
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
            <button type="submit" className="btn-red" disabled={saving}>
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Guardar presupuesto"}
            </button>
          </>
        }
      />

      {error && (
        <p className="mb-5 border-2 border-amber bg-amber-bg px-4 py-3 text-[14px] font-semibold text-amber" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Datos">
            <div className="grid gap-4 sm:grid-cols-[160px_180px_1fr]">
              <Field label="Número" htmlFor="b-number" error={numberTaken ? "Ese número ya existe" : null}>
                <input id="b-number" className="input num" value={number} onChange={(e) => touch(setNumber)(e.target.value)} required />
              </Field>
              <Field label="Fecha de emisión" htmlFor="b-date">
                <input id="b-date" type="date" className="input" value={date} onChange={(e) => touch(setDate)(e.target.value)} required />
              </Field>
              <Field label="Cliente" htmlFor="b-client">
                <input
                  id="b-client"
                  className="input"
                  list="clients-list"
                  value={client}
                  onChange={(e) => touch(setClient)(e.target.value)}
                  placeholder="Quien paga"
                  required
                />
              </Field>
            </div>
            <div className="mt-4 grid gap-4">
              <Field label="Proyecto" htmlFor="b-project" hint="Para quién es el trabajo (aparece en el estado de cuenta).">
                <input
                  id="b-project"
                  className="input"
                  list="projects-list"
                  value={project}
                  onChange={(e) => touch(setProject)(e.target.value)}
                  required
                />
              </Field>
              {!schemaReady ? (
                <p className="border-2 border-dashed border-ink-2 bg-paper px-3 py-2.5 text-[13.5px] text-ink-2">
                  <b className="text-ink">Forma de pago con anticipo y aprobación:</b> se activan al aplicar la migración 11 en la base de datos.
                </p>
              ) : (
              <div className="grid gap-4 border-2 border-ink bg-paper p-3 sm:grid-cols-[auto_1fr] sm:items-end">
                <div>
                  <span className="field-label">Forma de pago</span>
                  <Segmented
                    value={advanceOn ? "advance" : "due"}
                    onChange={(v) => {
                      setAdvanceOn(v === "advance")
                      setDirty(true)
                    }}
                    options={[
                      { value: "due", label: "Todo al vencer" },
                      { value: "advance", label: "Con anticipo" },
                    ]}
                  />
                </div>
                {advanceOn ? (
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="block w-[120px]">
                      <span className="field-label">Anticipo</span>
                      <input
                        className="input num"
                        inputMode="decimal"
                        value={advanceText}
                        onChange={(e) => touch(setAdvanceText)(e.target.value)}
                        aria-label="Anticipo"
                      />
                    </label>
                    <Segmented
                      className="h-10 [&>button]:h-full"
                      value={advanceType}
                      onChange={(v) => touch(setAdvanceType)(v)}
                      options={[
                        { value: "percent", label: "%" },
                        { value: "amount", label: "$" },
                      ]}
                    />
                    <p className="pb-2 text-[13.5px] text-ink-2">
                      = <b className="num text-ink">{usd(advanceAmount)}</b> al aprobar · resto {usd(Math.max(total - advanceAmount, 0))} contra entrega
                    </p>
                  </div>
                ) : (
                  <p className="pb-2 text-[13.5px] text-ink-2">Se cobra el total a los {settings.due_days} días de aprobado.</p>
                )}
              </div>
              )}
              {!editing && schemaReady && (
                <label className="flex cursor-pointer items-start gap-3 text-[14px]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 accent-[#0E1422]"
                    checked={approved}
                    onChange={(e) => setApproved(e.target.checked)}
                  />
                  <span>
                    <b>El cliente ya lo aprobó</b>
                    <span className="block text-ink-2">Si no, queda <b>por aprobar</b> y no suma a cuentas por cobrar hasta que lo apruebes.</span>
                  </span>
                </label>
              )}
              <Field label="Otros detalles" htmlFor="b-desc">
                <textarea
                  id="b-desc"
                  className="input"
                  rows={3}
                  value={description}
                  onChange={(e) => touch(setDescription)(e.target.value)}
                  placeholder="Presupuesto sujeto a disponibilidad. Forma de pago a convenir según acuerdo comercial."
                />
              </Field>
            </div>
            <datalist id="clients-list">
              {clientOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <datalist id="projects-list">
              {projectOptions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <datalist id="categories-list">
              {categoryOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Panel>

          <Panel
            title="Ítems"
            aside={
              <button type="button" className="btn-ink btn-sm" onClick={() => setDrafts((d) => [...d, blank()])}>
                <Plus className="h-4 w-4" strokeWidth={3} />
                Agregar ítem
              </button>
            }
            bodyClass="p-0"
          >
            <ol>
              {drafts.map((d, idx) => {
                const it = toItem(d)
                const disc = itemDiscount(it)
                return (
                  <li key={d.id} className="grid gap-3 border-b-2 border-ink/15 p-4 last:border-0">
                    <div className="flex items-start gap-3">
                      <span className="display mt-2 w-6 shrink-0 text-[18px] text-ink-mute">{idx + 1}</span>
                      <div className="grid flex-1 gap-3 sm:grid-cols-[200px_1fr]">
                        <input
                          className="input"
                          list="categories-list"
                          value={d.category}
                          onChange={(e) => setDraft(d.id, { category: e.target.value })}
                          placeholder="Categoría"
                          aria-label={`Categoría del ítem ${idx + 1}`}
                        />
                        <textarea
                          className="input min-h-[40px]"
                          rows={1}
                          value={d.description}
                          onChange={(e) => setDraft(d.id, { description: e.target.value })}
                          placeholder="Descripción del trabajo"
                          aria-label={`Descripción del ítem ${idx + 1}`}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-ghost btn-icon mt-1 shrink-0"
                        onClick={() => {
                          setDrafts((ds) => (ds.length > 1 ? ds.filter((x) => x.id !== d.id) : [blank()]))
                          setDirty(true)
                        }}
                        aria-label={`Quitar ítem ${idx + 1}`}
                        title="Quitar ítem"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pl-9 sm:grid-cols-[90px_110px_120px_minmax(150px,1fr)_auto] sm:items-end">
                      <label className="block">
                        <span className="field-label">Cantidad</span>
                        <input className="input num" inputMode="decimal" value={d.quantity} onChange={(e) => setDraft(d.id, { quantity: e.target.value })} />
                      </label>
                      <label className="block">
                        <span className="field-label">Unidad</span>
                        <input className="input" value={d.unit} onChange={(e) => setDraft(d.id, { unit: e.target.value })} />
                      </label>
                      <label className="block">
                        <span className="field-label">Precio ($)</span>
                        <input className="input num" inputMode="decimal" value={d.rate} onChange={(e) => setDraft(d.id, { rate: e.target.value })} />
                      </label>
                      <div>
                        <span className="field-label">Descuento</span>
                        <div className="flex">
                          <input
                            className="input num min-w-0 border-r-0"
                            inputMode="decimal"
                            value={d.discount_value}
                            onChange={(e) => setDraft(d.id, { discount_value: e.target.value })}
                            placeholder="0"
                            aria-label={`Descuento del ítem ${idx + 1}`}
                          />
                          <Segmented
                            size="sm"
                            className="h-10 [&>button]:h-full"
                            value={d.discount_type}
                            onChange={(v) => setDraft(d.id, { discount_type: v })}
                            options={[
                              { value: "percent", label: "%" },
                              { value: "amount", label: "$" },
                            ]}
                          />
                        </div>
                      </div>
                      <div className="col-span-2 text-right sm:col-span-1">
                        <span className="field-label">Importe</span>
                        <div className="display h-10 whitespace-nowrap pt-2 text-[19px]">{usd(itemNet(it))}</div>
                        {disc > 0 && <div className="num -mt-1 text-[12px] text-amber">−{usd(disc)}</div>}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </Panel>

          <div className="grid border-2 border-ink bg-white shadow-hard sm:grid-cols-[1fr_1fr_1.4fr]">
            <div className="px-4 py-3">
              <div className="text-[12.5px] font-semibold text-ink-2">Subtotal</div>
              <div className="display mt-1 text-[22px]">{usd(subtotal)}</div>
            </div>
            <div className="border-t-2 border-ink px-4 py-3 sm:border-l-2 sm:border-t-0">
              <div className="text-[12.5px] font-semibold text-ink-2">Descuento</div>
              <div className={`display mt-1 text-[22px] ${discount > 0 ? "text-amber" : ""}`}>{discount > 0 ? `−${usd(discount)}` : usd(0)}</div>
            </div>
            <div className="bg-noche border-t-2 border-ink px-4 py-3 text-snow sm:border-l-2 sm:border-t-0">
              <div className="text-[12.5px] font-semibold text-snow-2">Total</div>
              <div className="display mt-1 text-[30px]">{usd(total)}</div>
              {rate && <div className="num text-[13px] text-snow-2">{ves(total * rate)} a la tasa de hoy</div>}
              {advanceAmount > 0 && (
                <div className="num mt-1 text-[13px] font-semibold text-snow">
                  Anticipo {usd(advanceAmount)} · resto {usd(Math.max(total - advanceAmount, 0))}
                </div>
              )}
            </div>
          </div>
          {editing && paid > 0 && (
            <p className="text-[13.5px] text-ink-2">
              Este presupuesto ya tiene {usd(paid)} abonados; el saldo quedará en <b className="text-ink">{usd(Math.max(total - paid, 0))}</b>.
            </p>
          )}
        </div>

        <div className="min-w-0">
          <div className="2xl:sticky 2xl:top-6">
            <div className="mb-2 flex items-center justify-between text-[13px] font-semibold text-ink-2">
              <span>Así se imprime</span>
              <span>A4</span>
            </div>
            <div className="border-2 border-ink bg-paper-2 p-3 shadow-hard">
              <DocPreview html={html} />
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}
