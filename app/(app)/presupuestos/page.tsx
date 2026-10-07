"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Ban, Copy, Download, Plus, Printer, RotateCcw, Search } from "lucide-react"
import { useData } from "@/hooks/data"
import { useRate } from "@/hooks/rate"
import { usePaymentDialog } from "@/components/payments/payment-dialog"
import { BudgetTag, Empty, PageHeader, Segmented, useToast } from "@/components/ui/kit"
import { Modal } from "@/components/ui/modal"
import { dateFmt, plural, today, usd } from "@/lib/format"
import { isActive, isLate, isOpen, isQuote, pendingOf } from "@/lib/metrics"
import { entityKey, groupNames } from "@/lib/entities"
import { printBudget } from "@/lib/report-actions"
import { downloadCSV } from "@/lib/print"
import type { Budget } from "@/lib/types"

type Filter = "all" | "quote" | "open" | "late" | "paid" | "cancelled"

export default function PresupuestosPage() {
  const { budgets, settings, setBudgetCancelled, setBudgetApproved, schemaReady } = useData()
  const { rate, rateDate } = useRate()
  const openPayment = usePaymentDialog()
  const toast = useToast()
  const t = today()

  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [client, setClient] = useState("")
  const [year, setYear] = useState("")
  const [confirm, setConfirm] = useState<Budget | null>(null)
  const [busy, setBusy] = useState(false)

  const clients = useMemo(() => {
    const names = groupNames(budgets.map((b) => b.client_name))
    return Array.from(names.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [budgets])
  const years = useMemo(() => Array.from(new Set(budgets.map((b) => b.date.slice(0, 4)))).sort().reverse(), [budgets])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return budgets.filter((b) => {
      if (filter === "quote" && !isQuote(b)) return false
      if (filter === "open" && !isOpen(b)) return false
      if (filter === "late" && !isLate(b, settings.due_days, t)) return false
      if (filter === "paid" && (isOpen(b) || !isActive(b) || isQuote(b))) return false
      if (filter === "cancelled" && isActive(b)) return false
      if (client && entityKey(b.client_name) !== client) return false
      if (year && !b.date.startsWith(year)) return false
      if (needle) {
        const hay = `${b.number} ${b.client_name} ${b.project_name} ${b.project_description ?? ""} ${b.items
          .map((i) => i.description)
          .join(" ")}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [budgets, q, filter, client, year, settings.due_days, t])

  const totals = rows.reduce(
    (acc, b) => ({
      total: acc.total + (isActive(b) ? b.total : 0),
      paid: acc.paid + (isActive(b) ? b.paid_amount : 0),
      pending: acc.pending + pendingOf(b),
    }),
    { total: 0, paid: 0, pending: 0 },
  )
  const openCount = budgets.filter(isOpen).length
  const quoteCount = budgets.filter(isQuote).length

  const approve = async (b: Budget) => {
    const { error } = await setBudgetApproved(b, true)
    toast(error ?? `Presupuesto ${b.number} aprobado: ya cuenta como cuenta por cobrar.`, error ? "warn" : "ok")
  }

  const exportCSV = () =>
    downloadCSV(`presupuestos-${t}.csv`, [
      ["Número", "Fecha", "Cliente", "Proyecto", "Total USD", "Abonado USD", "Saldo USD", "Estado"],
      ...rows.map((b) => [
        b.number,
        dateFmt(b.date),
        b.client_name.trim(),
        b.project_name.trim(),
        b.total,
        b.paid_amount,
        pendingOf(b),
        !isActive(b) ? "Cancelado" : isQuote(b) ? "Por aprobar" : isOpen(b) ? (isLate(b, settings.due_days, t) ? "Vencido" : "Por cobrar") : "Pagado",
      ]),
    ])

  const toggleCancel = async () => {
    if (!confirm) return
    setBusy(true)
    const cancel = isActive(confirm)
    const { error } = await setBudgetCancelled(confirm, cancel)
    setBusy(false)
    if (error) return toast(error, "warn")
    toast(cancel ? `Presupuesto ${confirm.number} cancelado.` : `Presupuesto ${confirm.number} reactivado.`)
    setConfirm(null)
  }

  return (
    <>
      <PageHeader
        title="Presupuestos"
        tail={`${budgets.length} emitidos.`}
        meta={`${plural(openCount, "presupuesto aprobado", "presupuestos aprobados")} con saldo por cobrar${quoteCount ? ` · ${plural(quoteCount, "por aprobar", "por aprobar")}` : ""}.`}
        actions={
          <>
            <button className="btn-paper" onClick={exportCSV} disabled={!rows.length}>
              <Download className="h-4 w-4" />
              CSV
            </button>
            <Link href="/presupuestos/nuevo" className="btn-red">
              <Plus className="h-4 w-4" strokeWidth={3} />
              Nuevo presupuesto
            </Link>
          </>
        }
      />

      <div className="mb-5 flex flex-col gap-3 border-2 border-ink bg-white p-3 xl:flex-row xl:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-2" />
          <input
            className="input pl-9"
            placeholder="Buscar por número, cliente, proyecto o ítem…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar"
          />
        </div>
        <div className="overflow-x-auto">
          <Segmented
            value={filter}
            onChange={setFilter}
            size="sm"
            options={[
              { value: "all", label: "Todos" },
              { value: "quote", label: "Por aprobar" },
              { value: "open", label: "Por cobrar" },
              { value: "late", label: "Vencidos" },
              { value: "paid", label: "Pagados" },
              { value: "cancelled", label: "Cancelados" },
            ]}
          />
        </div>
        <div className="flex gap-3">
          <select className="input h-9 min-w-[200px] text-[14px]" value={client} onChange={(e) => setClient(e.target.value)} aria-label="Cliente">
            <option value="">Todos los clientes</option>
            {clients.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="input h-9 w-[110px] text-[14px]" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Año">
            <option value="">Año</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty title="Ningún presupuesto coincide.">Prueba con otro filtro o búsqueda.</Empty>
      ) : (
        <div className="overflow-x-auto border-2 border-ink bg-white shadow-hard">
          <table className="tbl min-w-[980px]">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Fecha</th>
                <th>Cliente · proyecto</th>
                <th className="r">Total</th>
                <th className="r">Abonado</th>
                <th className="r">Saldo</th>
                <th>Estado</th>
                <th className="r">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className={!isActive(b) ? "text-ink-mute" : undefined}>
                  <td>
                    <Link href={`/presupuestos/${b.id}`} className="font-bold text-ink hover:underline">
                      {b.number}
                    </Link>
                  </td>
                  <td className="num whitespace-nowrap">{dateFmt(b.date)}</td>
                  <td className="max-w-[340px]">
                    <Link href={`/presupuestos/${b.id}`} className="block truncate font-semibold hover:underline">
                      {b.project_name}
                    </Link>
                    <div className="truncate text-[12.5px] text-ink-2">
                      {b.client_name} · {plural(b.items.length, "ítem", "ítems")}
                    </div>
                  </td>
                  <td className="r num">{usd(b.total)}</td>
                  <td className="r num">{b.paid_amount > 0 ? usd(b.paid_amount) : "—"}</td>
                  <td className="r num font-bold">{pendingOf(b) > 0 ? usd(pendingOf(b)) : "—"}</td>
                  <td>
                    <BudgetTag budget={b} dueDays={settings.due_days} today={t} />
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      {isQuote(b) && schemaReady && (
                        <button className="btn-ink btn-sm" onClick={() => approve(b)}>
                          Aprobar
                        </button>
                      )}
                      {isOpen(b) && (
                        <button className="btn-paper btn-sm" onClick={() => openPayment(b.id)}>
                          Cobrar
                        </button>
                      )}
                      <button
                        className="btn-ghost btn-sm btn-icon"
                        title="Imprimir"
                        aria-label={`Imprimir ${b.number}`}
                        onClick={() => printBudget(b, settings)}
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                      <Link href={`/presupuestos/nuevo?desde=${b.id}`} className="btn-ghost btn-sm btn-icon" title="Duplicar" aria-label={`Duplicar ${b.number}`}>
                        <Copy className="h-4 w-4" />
                      </Link>
                      <button
                        className="btn-ghost btn-sm btn-icon"
                        title={isActive(b) ? "Cancelar" : "Reactivar"}
                        aria-label={`${isActive(b) ? "Cancelar" : "Reactivar"} ${b.number}`}
                        onClick={() => setConfirm(b)}
                      >
                        {isActive(b) ? <Ban className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>{plural(rows.length, "presupuesto", "presupuestos")}</td>
                <td className="r num">{usd(totals.total)}</td>
                <td className="r num">{usd(totals.paid)}</td>
                <td className="r num">{usd(totals.pending)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {confirm && (
        <Modal
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title={isActive(confirm) ? `¿Cancelar el ${confirm.number}?` : `¿Reactivar el ${confirm.number}?`}
          description={
            isActive(confirm)
              ? "Deja de contar como cuenta por cobrar y como ingreso. No se borra: puedes reactivarlo cuando quieras."
              : "Vuelve a contar como cuenta por cobrar con su saldo actual."
          }
          footer={
            <>
              <button className="btn-paper" onClick={() => setConfirm(null)}>
                Volver
              </button>
              <button className={isActive(confirm) ? "btn-ink" : "btn-red"} onClick={toggleCancel} disabled={busy}>
                {isActive(confirm) ? "Cancelar presupuesto" : "Reactivar"}
              </button>
            </>
          }
        >
          <div className="border-2 border-ink bg-white p-3 text-[14px]">
            <div className="font-bold">{confirm.project_name}</div>
            <div className="text-ink-2">
              {confirm.client_name} · {dateFmt(confirm.date)} · {usd(confirm.total)}
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
