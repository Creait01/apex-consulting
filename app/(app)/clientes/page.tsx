"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ArrowRight, FileDown } from "lucide-react"
import { useData } from "@/hooks/data"
import { useRate } from "@/hooks/rate"
import { Empty, PageHeader, Stat } from "@/components/ui/kit"
import { StackBar } from "@/components/bars"
import { AGING, summarize } from "@/lib/metrics"
import { entitySlug } from "@/lib/entities"
import { dateFmt, pct, plural, today, usd, ves } from "@/lib/format"
import { printReceivables, receivableClients } from "@/lib/report-actions"

export default function ClientesPage() {
  const { budgets, payments, settings } = useData()
  const { rate, rateDate } = useRate()
  const t = today()
  const s = useMemo(() => summarize(budgets, payments, settings.due_days, t), [budgets, payments, settings.due_days, t])
  const agingByClient = useMemo(
    () => new Map(receivableClients(budgets, s, settings.due_days, t).map((c) => [c.name, c.aging])),
    [budgets, s, settings.due_days, t],
  )
  const withDebt = s.clients.filter((c) => c.pending > 0.005)

  return (
    <>
      <PageHeader
        title="Clientes"
        tail="y lo que te deben."
        meta={`${plural(s.clients.length, "cliente", "clientes")} · ${plural(withDebt.length, "con saldo", "con saldo")}`}
        actions={
          <button className="btn-paper" onClick={() => printReceivables(budgets, s, settings, t, { rate, rateDate })} disabled={!withDebt.length}>
            <FileDown className="h-4 w-4" />
            Cuentas por cobrar (PDF)
          </button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat tone="night" marker label="Por cobrar" value={usd(s.receivable)} sub={rate ? ves(s.receivable * rate) : undefined} />
        <Stat
          tone={s.overdue > 0 ? "amber" : "paper"}
          label="Vencido"
          value={usd(s.overdue)}
          valueClass={s.overdue > 0 ? "text-amber" : undefined}
          sub={`Más de ${settings.due_days} días desde la emisión`}
        />
        <Stat label="Tasa de cobro histórica" value={pct(s.collectionRate * 100, 1)} sub="Cobrado sobre lo presupuestado (sin cancelados)" />
      </div>

      {s.clients.length === 0 ? (
        <Empty title="Sin clientes todavía." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {s.clients.map((c) => {
            const aging = agingByClient.get(c.name)
            return (
              <Link
                key={c.key}
                href={`/clientes/${entitySlug(c.key)}`}
                className="group flex flex-col border-2 border-ink bg-white shadow-hard transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-hard-lg"
              >
                <div className="flex items-start justify-between gap-4 border-b-2 border-ink px-4 py-3.5">
                  <div className="min-w-0">
                    <h2 className="display-2 truncate text-[21px]">{c.name}</h2>
                    <p className="mt-1 text-[13px] text-ink-2">
                      {plural(c.count, "presupuesto", "presupuestos")}
                      {c.quoteCount > 0 && ` · ${c.quoteCount} por aprobar (${usd(c.quoteAmount)})`}
                      {c.lastPayment ? ` · último pago ${dateFmt(c.lastPayment)}` : ""}
                      {c.variants.length > 1 && ` · también escrito como «${c.variants.slice(1).join("», «")}»`}
                    </p>
                  </div>
                  <ArrowRight className="mt-1 h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" />
                </div>
                <div className="grid grid-cols-2 gap-[2px] bg-ink sm:grid-cols-4">
                  {[
                    ["Saldo", c.pending > 0.005 ? usd(c.pending) : "—", c.overdue > 0.005 ? "text-amber" : ""],
                    ["Vencido", c.overdue > 0.005 ? usd(c.overdue) : "—", c.overdue > 0.005 ? "text-amber" : ""],
                    ["Cobrado", usd(c.paid), ""],
                    ["Paga en", c.avgDaysToPay === null ? "—" : `${Math.round(c.avgDaysToPay)} días`, ""],
                  ].map(([k, v, cls]) => (
                    <div key={k} className="bg-white px-4 py-3">
                      <div className="text-[12px] font-semibold text-ink-2">{k}</div>
                      <div className={`display-2 mt-1 text-[18px] ${cls}`}>{v}</div>
                    </div>
                  ))}
                </div>
                {aging && c.pending > 0.005 && (
                  <div className="border-t-2 border-ink px-4 py-3">
                    <StackBar className="h-4" parts={AGING.map((a) => ({ label: a.label, value: aging[a.id], color: a.color }))} />
                    <div className="mt-2 text-[12.5px] text-ink-2">
                      {plural(c.openCount, "presupuesto abierto", "presupuestos abiertos")}
                      {rate ? ` · ${ves(c.pending * rate)}` : ""}
                    </div>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
