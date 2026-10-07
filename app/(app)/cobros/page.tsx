"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Check, Copy, Download, FileDown } from "lucide-react"
import { useData } from "@/hooks/data"
import { useRate } from "@/hooks/rate"
import { usePaymentDialog } from "@/components/payments/payment-dialog"
import { Empty, PageHeader, Panel, Segmented, Stat, useToast } from "@/components/ui/kit"
import { amount, dateFmt, daysBetween, lastMonths, monthLabel, monthLong, plural, rateFmt, today, usd, ves } from "@/lib/format"
import { daysLate, isOpen, pendingOf } from "@/lib/metrics"
import { entityKey, groupNames } from "@/lib/entities"
import { collectionRows, printCollections } from "@/lib/report-actions"
import { downloadCSV } from "@/lib/print"
import { methodLabel } from "@/lib/types"

type Cur = "all" | "VES" | "USD"

export default function CobrosPage() {
  const { budgets, payments, settings, schemaReady } = useData()
  const { rate, rateDate, rateOn } = useRate()
  const openPayment = usePaymentDialog()
  const toast = useToast()
  const t = today()
  const thisMonth = t.slice(0, 7)

  // El libro abre en el último mes con cobros (los pagos vienen ordenados del más reciente)
  const [month, setMonth] = useState(() => payments[0]?.payment_date.slice(0, 7) ?? thisMonth)
  const [cur, setCur] = useState<Cur>("all")
  const [client, setClient] = useState("")
  const [copied, setCopied] = useState<string | null>(null)

  const names = useMemo(() => groupNames(budgets.map((b) => b.client_name)), [budgets])
  const rows = useMemo(() => collectionRows(payments, budgets, rateOn), [payments, budgets, rateOn])

  /* Cuánto cobrar hoy, agrupado por cliente */
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; list: typeof budgets }>()
    for (const b of budgets.filter(isOpen)) {
      const key = entityKey(b.client_name)
      const g = map.get(key) ?? { name: names.get(key)!.name, list: [] }
      g.list.push(b)
      map.set(key, g)
    }
    return Array.from(map.values())
      .map((g) => ({ ...g, list: g.list.sort((a, b) => a.date.localeCompare(b.date)), total: g.list.reduce((s, b) => s + pendingOf(b), 0) }))
      .sort((a, b) => b.total - a.total)
  }, [budgets, names])
  const receivable = groups.reduce((s, g) => s + g.total, 0)

  /* Por mes (12 meses) */
  const months = useMemo(() => {
    const keys = lastMonths(12, t)
    const map = new Map(keys.map((k) => [k, { key: k, count: 0, usd: 0, vesReceived: 0, vesRef: 0, rates: [] as number[] }]))
    for (const r of rows) {
      const m = map.get(r.payment.payment_date.slice(0, 7))
      if (!m) continue
      m.count += 1
      m.usd += r.payment.amount
      if (r.payment.currency === "VES") m.vesReceived += r.payment.amount_ves ?? 0
      if (r.bs != null) m.vesRef += r.bs
      if (r.rate) m.rates.push(r.rate)
    }
    return keys.map((k) => map.get(k)!).reverse()
  }, [rows, t])
  const cur0 = months[0]
  const year = t.slice(0, 4)
  const yearRows = rows.filter((r) => r.payment.payment_date.startsWith(year))

  /* Libro filtrado */
  const monthOptions = useMemo(
    () => Array.from(new Set(payments.map((p) => p.payment_date.slice(0, 7)))).sort().reverse(),
    [payments],
  )
  const ledger = rows.filter(
    (r) =>
      (month === "all" || r.payment.payment_date.startsWith(month)) &&
      (cur === "all" || (r.payment.currency ?? "USD") === cur) &&
      (!client || (r.budget && entityKey(r.budget.client_name) === client)),
  )
  const ledgerUsd = ledger.reduce((s, r) => s + r.payment.amount, 0)
  const ledgerBs = ledger.reduce((s, r) => s + (r.bs ?? 0), 0)
  const period =
    (month === "all" ? "Todos los cobros" : monthLong(month)) +
    (client ? ` · ${names.get(client)?.name ?? ""}` : "") +
    (cur === "VES" ? " · en bolívares" : cur === "USD" ? " · en dólares" : "")

  const copyBs = async (id: string, value: number) => {
    try {
      await navigator.clipboard.writeText(amount(value))
      setCopied(id)
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600)
    } catch {
      toast("No se pudo copiar al portapapeles.", "warn")
    }
  }

  const exportCSV = () =>
    downloadCSV(`cobros-${month}-${t}.csv`, [
      ["Fecha", "Presupuesto", "Cliente", "Proyecto", "Método", "Referencia", "Moneda", "Tasa", "Bolívares", "USD"],
      ...ledger.map((r) => [
        dateFmt(r.payment.payment_date),
        r.budget?.number ?? "",
        r.budget?.client_name.trim() ?? "",
        r.budget?.project_name.trim() ?? "",
        methodLabel(r.payment.payment_method),
        r.payment.reference_number ?? "",
        r.payment.currency === "VES" ? "Bs" : "USD",
        r.rate ?? "",
        r.payment.currency === "VES" ? r.payment.amount_ves ?? "" : "",
        r.payment.amount,
      ]),
    ])

  return (
    <>
      <PageHeader
        title="Cobros"
        tail="en bolívares y dólares."
        meta={
          rate ? (
            <>
              Tasa BCV <b className="text-ink">{rateFmt(rate)} Bs/$</b>
              {rateDate && ` vigente desde el ${dateFmt(rateDate)}`}
            </>
          ) : (
            "Sin tasa BCV disponible ahora: los montos en Bs se muestran cuando responda."
          )
        }
        actions={
          <>
            <button className="btn-paper" onClick={exportCSV} disabled={!ledger.length}>
              <Download className="h-4 w-4" />
              CSV
            </button>
            <button className="btn-paper" onClick={() => printCollections(ledger, period, settings, t)} disabled={!ledger.length}>
              <FileDown className="h-4 w-4" />
              Reporte de cobros
            </button>
            <button className="btn-red" onClick={() => openPayment()}>
              Registrar cobro
            </button>
          </>
        }
      />

      {!schemaReady && (
        <div className="mb-6 border-2 border-amber bg-amber-bg p-4 text-[14px]">
          <b className="text-amber">Falta un paso en la base de datos.</b>{" "}
          <span className="text-ink-2">
            Para guardar cobros en bolívares (monto en Bs y tasa) hay que aplicar la migración{" "}
            <code className="font-mono text-[13px]">scripts/11-cobros-bs-aprobacion-y-seguridad.sql</code>. Mientras tanto los Bs se calculan como
            referencia con la tasa BCV de cada fecha.
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          tone="night"
          marker
          label="Por cobrar hoy en Bs"
          value={rate ? ves(receivable * rate) : "—"}
          sub={`${usd(receivable)} · ${plural(groups.reduce((s, g) => s + g.list.length, 0), "presupuesto", "presupuestos")}`}
        />
        <Stat
          label={`Cobrado en ${monthLong(thisMonth).split(" ")[0]}`}
          value={usd(cur0.usd)}
          sub={`${plural(cur0.count, "cobro", "cobros")} · ≈ ${ves(cur0.vesRef)}`}
        />
        <Stat
          label={`Recibido en Bs en ${monthLong(thisMonth).split(" ")[0]}`}
          value={ves(cur0.vesReceived)}
          sub={
            cur0.rates.length
              ? `Tasa promedio ${rateFmt(cur0.rates.reduce((a, b) => a + b, 0) / cur0.rates.length)}`
              : "Sin cobros en Bs este mes"
          }
        />
        <Stat
          label={`Cobrado en ${year}`}
          value={usd(yearRows.reduce((s, r) => s + r.payment.amount, 0))}
          sub={`≈ ${ves(yearRows.reduce((s, r) => s + (r.bs ?? 0), 0))} a la tasa de cada cobro`}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-12">
        <Panel
          className="xl:col-span-8"
          title="Cuánto cobrar hoy"
          aside={rate ? <span>Saldo × tasa BCV {rateFmt(rate)}</span> : undefined}
          bodyClass="p-0"
        >
          {groups.length === 0 ? (
            <div className="p-4">
              <Empty title="No hay saldos por cobrar." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl min-w-[720px]">
                <thead>
                  <tr>
                    <th>Nº</th>
                    <th>Proyecto</th>
                    <th className="r">Días</th>
                    <th className="r">Saldo $</th>
                    <th className="r">Saldo Bs</th>
                    <th className="r" />
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.name}>
                    <tr className="bg-paper">
                      <td colSpan={3} className="!border-b-2 !border-ink !bg-paper font-bold">
                        {g.name}
                      </td>
                      <td className="r num !border-b-2 !border-ink !bg-paper font-bold">{usd(g.total)}</td>
                      <td className="r num !border-b-2 !border-ink !bg-paper font-bold">{rate ? ves(g.total * rate) : "—"}</td>
                      <td className="r !border-b-2 !border-ink !bg-paper">
                        {rate && (
                          <button
                            className="btn-ghost btn-sm"
                            onClick={() => copyBs(g.name, g.total * rate)}
                            title="Copiar el total en Bs"
                          >
                            {copied === g.name ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            Bs
                          </button>
                        )}
                      </td>
                    </tr>
                    {g.list.map((b) => {
                      const late = daysLate(b, settings.due_days, t)
                      const p = pendingOf(b)
                      return (
                        <tr key={b.id}>
                          <td>
                            <Link href={`/presupuestos/${b.id}`} className="font-bold hover:underline">
                              {b.number}
                            </Link>
                          </td>
                          <td className="max-w-[260px]">
                            <div className="truncate font-semibold">{b.project_name}</div>
                            <div className="text-[12.5px] text-ink-2">
                              {dateFmt(b.date)}
                              {b.paid_amount > 0 ? ` · abonado ${usd(b.paid_amount)}` : ""}
                            </div>
                          </td>
                          <td className="r">
                            {late > 0 ? (
                              <span className="tag-late">{late} d</span>
                            ) : (
                              <span className="num text-ink-2">{daysBetween(b.date, t)}</span>
                            )}
                          </td>
                          <td className="r num font-semibold">{usd(p)}</td>
                          <td className="r num font-semibold">{rate ? ves(p * rate) : "—"}</td>
                          <td className="r whitespace-nowrap">
                            {rate && (
                              <button className="btn-ghost btn-sm btn-icon" onClick={() => copyBs(b.id, p * rate)} title="Copiar monto en Bs" aria-label={`Copiar monto en Bs del ${b.number}`}>
                                {copied === b.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                              </button>
                            )}
                            <button className="btn-paper btn-sm ml-1" onClick={() => openPayment(b.id)}>
                              Cobrar
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                ))}
                <tfoot>
                  <tr>
                    <td colSpan={3}>Total por cobrar</td>
                    <td className="r num">{usd(receivable)}</td>
                    <td className="r num">{rate ? ves(receivable * rate) : "—"}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Panel>

        <Panel className="xl:col-span-4" title="Por mes" bodyClass="p-0">
          <table className="tbl">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="r">Cobrado</th>
                <th className="r">Tasa</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.key} className="cursor-pointer" onClick={() => setMonth(m.key)} title="Ver en el libro de cobros">
                  <td className="whitespace-nowrap font-semibold">
                    <span className="capitalize">{monthLabel(m.key)}</span>
                    <div className="text-[12px] font-normal text-ink-2">{plural(m.count, "cobro", "cobros")}</div>
                  </td>
                  <td className="r num">
                    <div className="font-semibold">{m.usd ? usd(m.usd) : "—"}</div>
                    {m.vesRef > 0 && <div className="text-[12px] text-ink-2">≈ {ves(m.vesRef)}</div>}
                  </td>
                  <td className="r num text-ink-2">
                    {m.rates.length ? rateFmt(m.rates.reduce((a, b) => a + b, 0) / m.rates.length) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel
        className="mt-6"
        title="Libro de cobros"
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <select className="input h-8 w-auto text-[13px]" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mes">
              <option value="all">Todos los meses</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {monthLong(m)}
                </option>
              ))}
            </select>
            <select className="input h-8 w-auto max-w-[220px] text-[13px]" value={client} onChange={(e) => setClient(e.target.value)} aria-label="Cliente">
              <option value="">Todos los clientes</option>
              {Array.from(names.values())
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name}
                  </option>
                ))}
            </select>
            <Segmented
              size="sm"
              value={cur}
              onChange={setCur}
              options={[
                { value: "all", label: "Todo" },
                { value: "VES", label: "Bs" },
                { value: "USD", label: "$" },
              ]}
            />
          </div>
        }
        bodyClass="p-0"
      >
        {ledger.length === 0 ? (
          <div className="p-4">
            <Empty title="Sin cobros con ese filtro." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl min-w-[900px]">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Presupuesto</th>
                  <th>Método</th>
                  <th>Referencia</th>
                  <th className="r">Tasa</th>
                  <th className="r">Bolívares</th>
                  <th className="r">USD</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((r) => (
                  <tr key={r.payment.id}>
                    <td className="num whitespace-nowrap">{dateFmt(r.payment.payment_date)}</td>
                    <td className="max-w-[300px]">
                      {r.budget ? (
                        <Link href={`/presupuestos/${r.budget.id}`} className="block truncate font-semibold hover:underline">
                          {r.budget.number} · {r.budget.project_name}
                        </Link>
                      ) : (
                        "—"
                      )}
                      <div className="truncate text-[12.5px] text-ink-2">{r.budget?.client_name}</div>
                    </td>
                    <td>{methodLabel(r.payment.payment_method)}</td>
                    <td className="num text-ink-2">{r.payment.reference_number || "—"}</td>
                    <td className="r num text-ink-2">{r.rate ? rateFmt(r.rate) : "—"}</td>
                    <td className="r num">
                      {r.bs == null ? (
                        "—"
                      ) : r.bsIsReference ? (
                        <span className="text-ink-mute" title="Referencia a la tasa BCV de ese día (cobro registrado en dólares)">
                          ≈ {ves(r.bs)}
                        </span>
                      ) : (
                        <b>{ves(r.bs)}</b>
                      )}
                    </td>
                    <td className="r num font-bold">{usd(r.payment.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>{plural(ledger.length, "cobro", "cobros")}</td>
                  <td className="r num">≈ {ves(ledgerBs)}</td>
                  <td className="r num">{usd(ledgerUsd)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
      <p className="mt-3 text-[12.5px] text-ink-2">
        Los Bs con «≈» son referencia: el cobro se registró en dólares y se valora a la tasa BCV publicada para esa fecha.
      </p>
    </>
  )
}
