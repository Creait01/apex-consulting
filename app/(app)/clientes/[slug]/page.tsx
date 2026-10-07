"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { FileDown, Mail, RotateCcw } from "lucide-react"
import { useData } from "@/hooks/data"
import { useRate } from "@/hooks/rate"
import { usePaymentDialog } from "@/components/payments/payment-dialog"
import { BudgetTag, Empty, PageHeader, Panel, Segmented, Stat, useToast } from "@/components/ui/kit"
import { entityKey, groupNames, slugKey } from "@/lib/entities"
import { amount, dateFmt, daysBetween, parseAmount, plain, plural, round2, today, usd, ves } from "@/lib/format"
import {
  EPS,
  advanceDueOf,
  dueDateOf,
  hasAdvance,
  isActive,
  isLate,
  isOpen,
  isQuote,
  pendingOf,
  startOf,
} from "@/lib/metrics"
import { printStatement } from "@/lib/report-actions"
import { statementReport, type ChargeKind, type StatementInput, type StatementRow } from "@/lib/reports"
import { defaultStatementMessage, pdfName, statementEmail } from "@/lib/emails"
import { SendDialog } from "@/components/email/send-dialog"
import { methodLabel, type Budget } from "@/lib/types"
import { cn } from "@/lib/utils"

/* Qué se cobra de cada presupuesto en el estado de cuenta */
interface Charge {
  include: boolean
  kind: ChargeKind
  /** Porcentaje del total para el anticipo (50 % por lo general) */
  pct: number
  /** Monto acordado (modo "monto") */
  amount: number
  late: boolean
}

export default function ClientePage({ params }: { params: { slug: string } }) {
  const key = slugKey(params.slug)
  const { budgets, payments, settings, setBudgetApproved, schemaReady, emailFor } = useData()
  const { rate, rateDate } = useRate()
  const openPayment = usePaymentDialog()
  const toast = useToast()
  const t = today()
  const due = settings.due_days

  const all = useMemo(() => budgets.filter((b) => entityKey(b.client_name) === key), [budgets, key])
  const name = useMemo(() => groupNames(all.map((b) => b.client_name)).get(key)?.name ?? key, [all, key])
  const open = useMemo(() => all.filter(isOpen).sort((a, b) => startOf(a).localeCompare(startOf(b))), [all])
  const quotes = useMemo(() => all.filter(isQuote), [all])
  const ids = useMemo(() => new Set(all.map((b) => b.id)), [all])
  const own = useMemo(() => payments.filter((p) => ids.has(p.budget_id)), [payments, ids])

  /* Por defecto: anticipo si el presupuesto lo tiene y falta pagarlo; si no, el
     saldo. Vencido según el plazo. Todo se puede cambiar antes de imprimir. */
  const defaults = (b: Budget): Charge => ({
    include: true,
    kind: hasAdvance(b) && advanceDueOf(b) > EPS ? "anticipo" : "saldo",
    pct: b.advance_type === "percent" ? Number(b.advance_value) : 50,
    amount: pendingOf(b),
    late: isLate(b, due, t),
  })

  const storeKey = `apex:estado:${key}`
  const [charges, setCharges] = useState<Record<string, Charge>>({})
  const [opts, setOpts] = useState({ payments: true })
  const [hydrated, setHydrated] = useState(false)
  const [mailOpen, setMailOpen] = useState(false)

  useEffect(() => {
    let saved: Record<string, Charge> = {}
    try {
      saved = JSON.parse(sessionStorage.getItem(storeKey) || "{}")
    } catch {}
    setCharges(Object.fromEntries(open.map((b) => [b.id, saved[b.id] ?? defaults(b)])))
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey, open.length])

  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(storeKey, JSON.stringify(charges))
    } catch {}
  }, [charges, storeKey, hydrated])

  const chargeOf = (b: Budget) => charges[b.id] ?? defaults(b)
  const patch = (b: Budget, p: Partial<Charge>) => setCharges((c) => ({ ...c, [b.id]: { ...chargeOf(b), ...p } }))

  /** Lo que se cobra ahora de este presupuesto */
  const dueOf = (b: Budget) => {
    const c = chargeOf(b)
    const p = pendingOf(b)
    if (c.kind === "saldo") return p
    if (c.kind === "monto") return Math.min(Math.max(c.amount, 0), p)
    if (b.advance_type === "amount") return advanceDueOf(b)
    return Math.min(Math.max(round2((b.total * Math.min(Math.max(c.pct, 0), 100)) / 100 - b.paid_amount), 0), p)
  }
  const labelOf = (b: Budget) => {
    const c = chargeOf(b)
    if (c.kind === "saldo") return "Saldo"
    if (c.kind === "monto") return "Monto acordado"
    return b.advance_type === "amount" ? `Anticipo ${usd(Number(b.advance_value))}` : `Anticipo ${plain(c.pct)} %`
  }

  const included = open.filter((b) => chargeOf(b).include)
  const rows: StatementRow[] = included.map((b) => ({
    budget: b,
    due: dueOf(b),
    kind: chargeOf(b).kind,
    label: labelOf(b),
    late: chargeOf(b).late,
    lateDays: Math.max(daysBetween(dueDateOf(b, due), t), 0),
  }))
  const toPay = rows.reduce((s, r) => s + r.due, 0)
  const lateTotal = rows.reduce((s, r) => s + (r.late ? r.due : 0), 0)
  const balance = included.reduce((s, b) => s + pendingOf(b), 0)
  const active = all.filter((b) => isActive(b) && !isQuote(b))
  const lastPayment = own.reduce<string | null>((m, p) => (!m || p.payment_date > m ? p.payment_date : m), null)
  const history = [...all].sort((a, b) => b.date.localeCompare(a.date))

  if (all.length === 0) {
    return (
      <Empty title="No hay presupuestos de ese cliente.">
        <Link href="/clientes" className="btn-paper mt-3">
          Ver clientes
        </Link>
      </Empty>
    )
  }

  const statement: StatementInput = {
    clientName: name,
    rows,
    payments: own.filter((p) => included.some((b) => b.id === p.budget_id)).sort((a, b) => a.payment_date.localeCompare(b.payment_date)),
    settings,
    today: t,
    options: opts,
  }
  const print = () => printStatement(statement)
  const clientEmail = emailFor(name)

  const approve = async (b: Budget) => {
    const { error } = await setBudgetApproved(b, true)
    toast(error ?? `Presupuesto ${b.number} aprobado: ya cuenta como cuenta por cobrar.`, error ? "warn" : "ok")
  }

  return (
    <>
      <PageHeader
        title={name}
        meta={
          <>
            {plural(open.length, "presupuesto con saldo", "presupuestos con saldo")}
            {quotes.length > 0 && ` · ${plural(quotes.length, "por aprobar", "por aprobar")}`}
            {lastPayment ? ` · último pago el ${dateFmt(lastPayment)}` : ""}
            {" · "}
            {clientEmail ? <span className="text-ink">{clientEmail}</span> : <span className="text-amber">sin correo guardado</span>}
          </>
        }
        actions={
          <>
            <button className="btn-paper" onClick={() => openPayment(open[0]?.id)} disabled={!open.length}>
              Registrar cobro
            </button>
            <button className="btn-paper" onClick={print} disabled={!rows.length}>
              <FileDown className="h-4 w-4" />
              Imprimir
            </button>
            <button className="btn-red" onClick={() => setMailOpen(true)} disabled={!rows.length}>
              <Mail className="h-4 w-4" />
              Enviar estado de cuenta
            </button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat tone="night" marker label="A pagar ahora" value={usd(toPay)} sub={rate ? ves(toPay * rate) : undefined} />
        <Stat
          tone={lateTotal > 0 ? "amber" : "paper"}
          label="Vencido"
          value={usd(lateTotal)}
          valueClass={lateTotal > 0 ? "text-amber" : undefined}
          sub={rate && lateTotal > 0 ? ves(lateTotal * rate) : "Lo que marques como vencido"}
        />
        <Stat
          label="Saldo total"
          value={usd(balance)}
          sub={balance - toPay > EPS ? `${usd(balance - toPay)} queda contra entrega` : "Todo el saldo se cobra ahora"}
        />
        <Stat
          label="Histórico"
          value={usd(active.reduce((s, b) => s + b.paid_amount, 0))}
          sub={`cobrados de ${usd(active.reduce((s, b) => s + b.total, 0))} en ${plural(active.length, "presupuesto", "presupuestos")}`}
        />
      </div>

      <Panel
        className="mt-6"
        title="Arma el estado de cuenta"
        aside={
          <button className="btn-ghost btn-sm" onClick={() => setCharges(Object.fromEntries(open.map((b) => [b.id, defaults(b)])))}>
            <RotateCcw className="h-4 w-4" />
            Volver a lo sugerido
          </button>
        }
        bodyClass="p-0"
      >
        {open.length === 0 ? (
          <div className="p-4">
            <Empty title="Este cliente está al día.">No tiene presupuestos aprobados con saldo pendiente.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl min-w-[1000px]">
              <thead>
                <tr>
                  <th className="w-10" title="Incluir en el estado de cuenta" />
                  <th>Nº</th>
                  <th>Proyecto</th>
                  <th>Aprobado · vence</th>
                  <th className="r">Saldo</th>
                  <th>Qué se cobra</th>
                  <th className="r">A pagar</th>
                  <th className="c">Vencido</th>
                </tr>
              </thead>
              <tbody>
                {open.map((b) => {
                  const c = chargeOf(b)
                  const lateDays = daysBetween(dueDateOf(b, due), t)
                  return (
                    <tr key={b.id} className={cn(!c.include && "opacity-45", c.include && c.late && "[&>td]:!bg-amber-bg")}>
                      <td>
                        <input
                          type="checkbox"
                          checked={c.include}
                          onChange={(e) => patch(b, { include: e.target.checked })}
                          className="h-5 w-5 cursor-pointer accent-[#0E1422]"
                          aria-label={`Incluir el ${b.number} en el estado de cuenta`}
                        />
                      </td>
                      <td>
                        <Link href={`/presupuestos/${b.id}`} className="font-bold hover:underline">
                          {b.number}
                        </Link>
                      </td>
                      <td className="max-w-[200px]">
                        <div className="truncate font-semibold">{b.project_name}</div>
                        {hasAdvance(b) && <div className="text-[12px] text-ink-2">Con anticipo</div>}
                      </td>
                      <td className="num whitespace-nowrap text-[13px]">
                        {dateFmt(startOf(b))}
                        <div className={lateDays > 0 ? "font-semibold text-amber" : "text-ink-2"}>
                          {dateFmt(dueDateOf(b, due))} · {lateDays > 0 ? `${lateDays} d de atraso` : `faltan ${-lateDays} d`}
                        </div>
                      </td>
                      <td className="r num">
                        <div className="font-semibold">{usd(pendingOf(b))}</div>
                        <div className="whitespace-nowrap text-[12px] text-ink-2">de {usd(b.total)}</div>
                        {b.paid_amount > 0 && <div className="whitespace-nowrap text-[12px] text-ink-2">abonado {usd(b.paid_amount)}</div>}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Segmented
                            size="sm"
                            value={c.kind}
                            onChange={(v) => patch(b, { kind: v, amount: v === "monto" ? dueOf(b) : c.amount })}
                            options={[
                              { value: "saldo", label: "Saldo" },
                              { value: "anticipo", label: "Anticipo" },
                              { value: "monto", label: "Monto" },
                            ]}
                          />
                          {c.kind === "anticipo" && b.advance_type !== "amount" && (
                            <div className="flex">
                              <input
                                key={`${b.id}-pct-${c.pct}`}
                                className="input num h-8 w-[56px] border-r-0 px-2 text-right text-[13px]"
                                inputMode="decimal"
                                defaultValue={plain(c.pct)}
                                onBlur={(e) => patch(b, { pct: Math.min(parseAmount(e.target.value), 100) })}
                                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                aria-label="Porcentaje del anticipo"
                              />
                              <span className="flex h-8 items-center border-2 border-ink bg-paper px-1.5 text-[13px] font-semibold">%</span>
                            </div>
                          )}
                          {c.kind === "monto" && (
                            <div className="relative">
                              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[13px] text-ink-2">$</span>
                              <input
                                key={`${b.id}-amt-${c.amount}`}
                                className="input num h-8 w-[104px] pl-5 text-right text-[13px]"
                                inputMode="decimal"
                                defaultValue={amount(c.amount)}
                                onBlur={(e) => patch(b, { amount: parseAmount(e.target.value) })}
                                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                aria-label="Monto a cobrar"
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="r num">
                        <div className={cn("text-[15px] font-bold", c.late && "text-amber")}>{usd(dueOf(b))}</div>
                        <div className="text-[12px] text-ink-2">{labelOf(b)}</div>
                      </td>
                      <td className="c">
                        <input
                          type="checkbox"
                          checked={c.late}
                          onChange={(e) => patch(b, { late: e.target.checked })}
                          className="h-5 w-5 cursor-pointer accent-[#B45309]"
                          aria-label={`Marcar vencido el ${b.number}`}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>{plural(included.length, "presupuesto incluido", "presupuestos incluidos")}</td>
                  <td className="r num">{usd(balance)}</td>
                  <td />
                  <td className="r num">{usd(toPay)}</td>
                  <td className="c num text-amber">{usd(lateTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {open.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t-2 border-ink bg-paper px-4 py-3 text-[14px]">
            <span className="font-semibold">Incluir en el PDF:</span>
            {(
              [
                ["payments", "abonos recibidos"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#0E1422]"
                  checked={opts[k]}
                  onChange={(e) => setOpts((o) => ({ ...o, [k]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
            <div className="ml-auto flex gap-2">
              <button className="btn-paper btn-sm" onClick={print} disabled={!rows.length}>
                <FileDown className="h-4 w-4" />
                Imprimir
              </button>
              <button className="btn-red btn-sm" onClick={() => setMailOpen(true)} disabled={!rows.length}>
                <Mail className="h-4 w-4" />
                Enviar por correo
              </button>
            </div>
          </div>
        )}
      </Panel>

      {quotes.length > 0 && (
        <Panel
          className="mt-6"
          title="Por aprobar"
          aside={<span>No suman al estado de cuenta hasta que se aprueben</span>}
          bodyClass="p-0"
        >
          <table className="tbl">
            <tbody>
              {quotes.map((b) => (
                <tr key={b.id}>
                  <td className="w-20">
                    <Link href={`/presupuestos/${b.id}`} className="font-bold hover:underline">
                      {b.number}
                    </Link>
                  </td>
                  <td>
                    <div className="font-semibold">{b.project_name}</div>
                    <div className="text-[12.5px] text-ink-2">Emitido el {dateFmt(b.date)} · hace {daysBetween(b.date, t)} días</div>
                  </td>
                  <td className="r num font-bold">{usd(b.total)}</td>
                  <td className="r w-[140px]">
                    <button className="btn-ink btn-sm" onClick={() => approve(b)} disabled={!schemaReady}>
                      Aprobar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-12">
        <Panel className="xl:col-span-7" title="Todos sus presupuestos" bodyClass="p-0">
          <div className="max-h-[520px] overflow-auto">
            <table className="tbl">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th>Nº</th>
                  <th>Fecha</th>
                  <th>Proyecto</th>
                  <th className="r">Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/presupuestos/${b.id}`} className="font-bold hover:underline">
                        {b.number}
                      </Link>
                    </td>
                    <td className="num">{dateFmt(b.date)}</td>
                    <td className="max-w-[260px] truncate">{b.project_name}</td>
                    <td className="r num">{usd(b.total)}</td>
                    <td>
                      <BudgetTag budget={b} dueDays={due} today={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel className="xl:col-span-5" title="Pagos recibidos" aside={<span>{own.length}</span>} bodyClass="p-0">
          <div className="max-h-[520px] overflow-auto">
            <ul>
              {own.map((p) => {
                const b = all.find((x) => x.id === p.budget_id)
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-2.5 last:border-0">
                    <div className="min-w-0 text-[13.5px]">
                      <div className="truncate font-semibold">{b ? `${b.number} · ${b.project_name}` : ""}</div>
                      <div className="text-ink-2">
                        {dateFmt(p.payment_date)} · {methodLabel(p.payment_method)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="num font-bold">{usd(p.amount)}</div>
                      {p.currency === "VES" && p.amount_ves != null && <div className="num text-[12.5px] text-ink-2">{ves(p.amount_ves)}</div>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </Panel>
      </div>
      {mailOpen && (
        <SendDialog
          open
          onClose={() => setMailOpen(false)}
          title="Enviar estado de cuenta"
          clientName={name}
          defaultMessage={defaultStatementMessage({ clientName: name, rows, today: t })}
          payload={{
            build: (message, assets) =>
              statementEmail({
                clientName: name,
                rows,
                settings,
                today: t,
                message,
                pdfName: pdfName("Estado de cuenta", name, t),
                assets,
              }),
            pdfHtml: statementReport(statement),
            filename: pdfName("Estado de cuenta", name, t),
          }}
        />
      )}
    </>
  )
}
