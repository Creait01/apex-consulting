"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ArrowRight, FileDown } from "lucide-react"
import { useData } from "@/hooks/data"
import { useRate } from "@/hooks/rate"
import { usePaymentDialog } from "@/components/payments/payment-dialog"
import { BudgetTag, Empty, PageHeader, Panel, Stat, useToast } from "@/components/ui/kit"
import { MonthlyChart } from "@/components/charts"
import { BarList, Legend, StackBar } from "@/components/bars"
import { AGING, daysLate, delta, pendingOf, summarize } from "@/lib/metrics"
import type { Budget } from "@/lib/types"
import { entitySlug } from "@/lib/entities"
import { dateFmt, dateLong, dayLong, daysBetween, monthLong, pct, plural, rateFmt, today, usd, ves } from "@/lib/format"
import { methodLabel } from "@/lib/types"
import { printReceivables } from "@/lib/report-actions"

export default function ResumenPage() {
  const { budgets, payments, settings, setBudgetApproved, schemaReady } = useData()
  const toast = useToast()
  const approve = async (b: Budget) => {
    const { error } = await setBudgetApproved(b, true)
    toast(error ?? `Presupuesto ${b.number} aprobado: ya cuenta como cuenta por cobrar.`, error ? "warn" : "ok")
  }
  const { rate, rateDate } = useRate()
  const openPayment = usePaymentDialog()
  const t = today()
  const s = useMemo(() => summarize(budgets, payments, settings.due_days, t), [budgets, payments, settings.due_days, t])
  const byId = useMemo(() => new Map(budgets.map((b) => [b.id, b])), [budgets])

  const month = monthLong(t.slice(0, 7)).split(" ")[0]
  const prevMonth = monthLong(s.prevMonth.key).split(" ")[0]
  const day = Number(t.slice(8, 10))
  const versus = (now: number, before: number, total: number) => {
    const d = delta(now, before)
    const head = d === null ? `Al ${day} de ${prevMonth}: ${usd(before)}` : `${d >= 0 ? "▲" : "▼"} ${pct(Math.abs(d) * 100)} frente al ${day} de ${prevMonth}`
    return `${head} · ${prevMonth} cerró en ${usd(total)}`
  }
  const year = t.slice(0, 4)

  const toCollect = [...s.open]
    .sort((a, b) => daysLate(b, settings.due_days, t) - daysLate(a, settings.due_days, t) || pendingOf(b) - pendingOf(a))
    .slice(0, 8)
  const lastPayments = payments.slice(0, 8)
  const agingTotal = s.receivable || 1

  if (budgets.length === 0) {
    return (
      <>
        <PageHeader title="Resumen" tail="al día de hoy." meta={dateLong(t)} />
        <Empty title="Todavía no hay presupuestos.">
          <Link href="/presupuestos/nuevo" className="btn-red mt-3">
            Crear el primero
          </Link>
        </Empty>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Resumen"
        tail="al día de hoy."
        meta={
          <>
            {dayLong(t)}
            {rate && (
              <>
                {" · "}Tasa BCV <b className="text-ink">{rateFmt(rate)} Bs/$</b>
                {rateDate && rateDate !== t && <span className="text-ink-mute"> (del {dateFmt(rateDate)})</span>}
              </>
            )}
          </>
        }
        actions={
          <>
            <button className="btn-paper" onClick={() => printReceivables(budgets, s, settings, t, { rate, rateDate })}>
              <FileDown className="h-4 w-4" />
              Cuentas por cobrar
            </button>
            <button className="btn-red" onClick={() => openPayment()}>
              Registrar cobro
            </button>
          </>
        }
      />

      {/* Indicadores */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          tone="night"
          marker
          label="Por cobrar"
          value={usd(s.receivable)}
          sub={
            <>
              {rate && <div className="font-semibold text-snow">{ves(s.receivable * rate)}</div>}
              {plural(s.open.length, "presupuesto aprobado", "presupuestos aprobados")}
              {s.advancesDue > 0 && <div>incluye {usd(s.advancesDue)} de anticipos pendientes</div>}
            </>
          }
        />
        <Stat
          tone={s.overdue > 0 ? "amber" : "paper"}
          label="Vencido"
          value={usd(s.overdue)}
          valueClass={s.overdue > 0 ? "text-amber" : undefined}
          sub={`${plural(s.overdueCount, "presupuesto", "presupuestos")} con más de ${settings.due_days} días`}
        />
        <Stat
          label={`Cobrado en ${month}`}
          value={usd(s.thisMonth.collected)}
          sub={versus(s.thisMonth.collected, s.prevMonthToDate.collected, s.prevMonth.collected)}
        />
        <Stat
          label={`Presupuestado en ${month}`}
          value={usd(s.thisMonth.budgeted)}
          sub={`${plural(s.thisMonth.count, "presupuesto", "presupuestos")} · ${versus(s.thisMonth.budgeted, s.prevMonthToDate.budgeted, s.prevMonth.budgeted)}`}
        />
        <Stat
          label="Días para cobrar"
          value={s.avgDaysToPay === null ? "—" : `${Math.round(s.avgDaysToPay)} días`}
          sub={
            s.medianDaysToPay === null
              ? "Sin presupuestos pagados en 12 meses"
              : `De la emisión al último abono · mediana ${Math.round(s.medianDaysToPay)} días`
          }
        />
      </div>

      {/* Meses y antigüedad */}
      <div className="mt-6 grid gap-6 xl:grid-cols-12">
        <Panel
          className="xl:col-span-8"
          title="Presupuestado y cobrado"
          aside={
            <Legend
              items={[
                { label: "Presupuestado", color: "#0E1422" },
                { label: "Cobrado", color: "#E8380D" },
              ]}
            />
          }
        >
          <MonthlyChart data={s.months} />
          <div className="mt-4 grid grid-cols-2 gap-[2px] border-2 border-ink bg-ink sm:grid-cols-5">
            {[
              [`Presupuestado ${year}`, usd(s.yearBudgeted)],
              [`Cobrado ${year}`, usd(s.yearCollected)],
              ["Ticket promedio (12 m)", usd(s.avgTicket)],
              ["Tasa de cobro histórica", pct(s.collectionRate * 100, 1)],
              ["Cancelados", `${s.cancelled.count} · ${usd(s.cancelled.amount)}`],
            ].map(([k, v]) => (
              <div key={k} className="bg-white px-3 py-2.5">
                <div className="text-[12px] font-semibold text-ink-2">{k}</div>
                <div className="display-2 mt-1 text-[17px]">{v}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="xl:col-span-4" title="Antigüedad de saldos" aside={<b className="num text-ink">{usd(s.receivable)}</b>}>
          <StackBar parts={AGING.map((a) => ({ label: a.label, value: s.aging[a.id].amount, color: a.color }))} />
          <table className="tbl mt-4">
            <thead>
              <tr>
                <th>Atraso</th>
                <th className="r">Nº</th>
                <th className="r">Saldo</th>
                <th className="r">%</th>
              </tr>
            </thead>
            <tbody>
              {AGING.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="flex items-center gap-2 whitespace-nowrap font-semibold">
                      <i className="inline-block h-3 w-3 shrink-0 border border-ink" style={{ background: a.color }} />
                      {a.label}
                    </span>
                  </td>
                  <td className="r num">{s.aging[a.id].count}</td>
                  <td className="r num font-semibold">{usd(s.aging[a.id].amount)}</td>
                  <td className="r num text-ink-2">{pct((s.aging[a.id].amount / agingTotal) * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[12.5px] text-ink-2">
            Un presupuesto vence a los {settings.due_days} días de emitido (se cambia en Ajustes).
          </p>
        </Panel>
      </div>

      {/* Lo que hay que cobrar y lo último cobrado */}
      <div className="mt-6 grid gap-6 xl:grid-cols-12">
        <Panel
          className="xl:col-span-7"
          title="Por cobrar ahora"
          aside={
            <Link href="/cobros" className="flex items-center gap-1 font-semibold text-ink hover:underline">
              Ver cobros <ArrowRight className="h-4 w-4" />
            </Link>
          }
          bodyClass="p-0"
        >
          {toCollect.length === 0 ? (
            <div className="p-4">
              <Empty title="Todo cobrado.">No hay presupuestos con saldo pendiente.</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl min-w-[500px]">
                <thead>
                  <tr>
                    <th>Nº</th>
                    <th>Cliente · proyecto</th>
                    <th className="r">Atraso</th>
                    <th className="r">Saldo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {toCollect.map((b) => {
                    const late = daysLate(b, settings.due_days, t)
                    return (
                      <tr key={b.id}>
                        <td>
                          <Link href={`/presupuestos/${b.id}`} className="font-bold hover:underline">
                            {b.number}
                          </Link>
                        </td>
                        <td className="max-w-[260px]">
                          <div className="truncate font-semibold">{b.project_name}</div>
                          <div className="truncate text-[12.5px] text-ink-2">{b.client_name}</div>
                        </td>
                        <td className="r">
                          {late > 0 ? <span className="tag-late">{late} d</span> : <BudgetTag budget={b} dueDays={settings.due_days} today={t} />}
                        </td>
                        <td className="r num">
                          <div className="font-bold">{usd(pendingOf(b))}</div>
                          {rate && <div className="text-[12.5px] text-ink-2">{ves(pendingOf(b) * rate)}</div>}
                        </td>
                        <td className="r">
                          <button className="btn-paper btn-sm" onClick={() => openPayment(b.id)}>
                            Cobrar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="flex flex-col gap-6 xl:col-span-5">
        {s.quotes.length > 0 && (
          <Panel
            title="Por aprobar"
            aside={<b className="num text-ink">{usd(s.quoteAmount)}</b>}
            bodyClass="p-0"
          >
            <ul>
              {s.quotes.slice(0, 6).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-2.5 last:border-0">
                  <div className="min-w-0">
                    <Link href={`/presupuestos/${b.id}`} className="block truncate text-[14px] font-semibold hover:underline">
                      {b.number} · {b.project_name}
                    </Link>
                    <div className="text-[12.5px] text-ink-2">
                      {b.client_name} · enviado hace {daysBetween(b.date, t)} días
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="num font-bold">{usd(b.total)}</span>
                    {schemaReady && (
                      <button className="btn-ink btn-sm" onClick={() => approve(b)}>
                        Aprobar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t-2 border-ink bg-paper px-4 py-2 text-[12.5px] text-ink-2">
              No suman a cuentas por cobrar hasta que se aprueban.
              {s.approvalRate !== null && <> Tasa de aprobación (12 m): <b className="text-ink">{pct(s.approvalRate * 100)}</b></>}
            </div>
          </Panel>
        )}
        <Panel title="Últimos cobros" bodyClass="p-0">
          {lastPayments.length === 0 ? (
            <div className="p-4">
              <Empty title="Sin cobros registrados." />
            </div>
          ) : (
            <ul>
              {lastPayments.map((p) => {
                const b = byId.get(p.budget_id)
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-2.5 last:border-0">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold">
                        {b ? `${b.number} · ${b.project_name}` : "Presupuesto"}
                      </div>
                      <div className="text-[12.5px] text-ink-2">
                        {dateFmt(p.payment_date)} · {methodLabel(p.payment_method)}
                        {p.reference_number ? ` · ${p.reference_number}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="num font-bold">{usd(p.amount)}</div>
                      {p.currency === "VES" && p.amount_ves != null && (
                        <div className="num text-[12.5px] text-ink-2">{ves(p.amount_ves)}</div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
        </div>
      </div>

      {/* Clientes y proyectos */}
      <div className="mt-6 grid gap-6 xl:grid-cols-12">
        <Panel
          className="xl:col-span-7"
          title="Clientes"
          aside={
            <Link href="/clientes" className="flex items-center gap-1 font-semibold text-ink hover:underline">
              Estados de cuenta <ArrowRight className="h-4 w-4" />
            </Link>
          }
          bodyClass="p-0"
        >
          <div className="overflow-x-auto">
            <table className="tbl min-w-[520px]">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="r">Presupuestado</th>
                  <th className="r">Cobrado</th>
                  <th className="r">Saldo</th>
                  <th className="r">Último pago</th>
                </tr>
              </thead>
              <tbody>
                {s.clients.map((c) => (
                  <tr key={c.key}>
                    <td>
                      <Link href={`/clientes/${entitySlug(c.key)}`} className="font-semibold hover:underline">
                        {c.name}
                      </Link>
                      <div className="text-[12px] text-ink-2">{plural(c.count, "presupuesto", "presupuestos")}</div>
                    </td>
                    <td className="r num">{usd(c.budgeted)}</td>
                    <td className="r num">{usd(c.paid)}</td>
                    <td className="r num font-bold">
                      {c.pending > 0.005 ? <span className={c.overdue > 0.005 ? "text-amber" : undefined}>{usd(c.pending)}</span> : "—"}
                    </td>
                    <td className="r num">
                      <div>{c.lastPayment ? dateFmt(c.lastPayment) : "—"}</div>
                      {c.avgDaysToPay !== null && <div className="whitespace-nowrap text-[12px] text-ink-2">paga en ~{Math.round(c.avgDaysToPay)} días</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="flex flex-col gap-6 xl:col-span-5">
          <Panel title="Proyectos que más facturan">
            <BarList
              rows={s.projects.slice(0, 7).map((p) => ({
                label: p.name,
                value: p.budgeted,
                sub: `${plural(p.count, "presupuesto", "presupuestos")}${p.pending > 0.005 ? ` · saldo ${usd(p.pending)}` : ""}`,
              }))}
            />
          </Panel>
          <Panel title="Cómo te pagan">
            <BarList
              color="#E8380D"
              rows={s.methods.map((m) => ({ label: methodLabel(m.method), value: m.amount, sub: plural(m.count, "cobro", "cobros") }))}
            />
          </Panel>
        </div>
      </div>
    </>
  )
}
