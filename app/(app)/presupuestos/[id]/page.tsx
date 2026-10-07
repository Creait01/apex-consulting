"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Ban, Copy, Mail, Pencil, Printer, RotateCcw } from "lucide-react"
import { useData } from "@/hooks/data"
import { useRate } from "@/hooks/rate"
import { usePaymentDialog } from "@/components/payments/payment-dialog"
import { BudgetEditor } from "@/components/budgets/editor"
import { DocPreview } from "@/components/budgets/preview"
import { BudgetTag, Empty, Loading, PageHeader, Panel, useToast } from "@/components/ui/kit"
import { Modal } from "@/components/ui/modal"
import { budgetReport } from "@/lib/reports"
import { budgetEmail, defaultBudgetMessage, pdfName } from "@/lib/emails"
import { SendDialog } from "@/components/email/send-dialog"
import { printBudget } from "@/lib/report-actions"
import { addDays, dateFmt, daysBetween, plural, rateFmt, today, usd, ves } from "@/lib/format"
import { advanceDueOf, advanceLabel, advanceOf, balanceOf, dueDateOf, hasAdvance, isActive, isOpen, isQuote, pendingOf } from "@/lib/metrics"
import { entityKey, entitySlug } from "@/lib/entities"
import { methodLabel } from "@/lib/types"

function BudgetView({ id }: { id: string }) {
  const params = useSearchParams()
  const { budgets, payments, settings, setBudgetCancelled, setBudgetApproved, schemaReady } = useData()
  const { rate, rateDate, rateOn } = useRate()
  const openPayment = usePaymentDialog()
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const [mailOpen, setMailOpen] = useState(false)
  // Recién creado: abrir el envío al cliente para revisarlo y mandarlo
  useEffect(() => {
    if (params.get("enviar") === "1") setMailOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const t = today()

  const b = budgets.find((x) => x.id === id)
  if (!b) {
    return (
      <Empty title="Ese presupuesto no existe.">
        <Link href="/presupuestos" className="btn-paper mt-3">
          Ver presupuestos
        </Link>
      </Empty>
    )
  }
  if (params.get("editar") === "1") return <BudgetEditor key={b.id + b.updated_at} budget={b} />

  const own = payments.filter((p) => p.budget_id === b.id).sort((x, y) => x.payment_date.localeCompare(y.payment_date))
  const quote = isQuote(b)
  // Por aprobar: lo que se cobraría al aprobarlo; aprobado: el saldo por cobrar
  const pending = quote ? balanceOf(b) : pendingOf(b)
  const due = dueDateOf(b, settings.due_days)
  const late = daysBetween(due, t)

  const approve = async (approved: boolean) => {
    const { error } = await setBudgetApproved(b, approved)
    if (error) return toast(error, "warn")
    toast(approved ? `Presupuesto ${b.number} aprobado: ya cuenta como cuenta por cobrar.` : `Presupuesto ${b.number} vuelve a estar por aprobar.`)
  }
  const html = budgetReport(b, settings)
  // Saldo de la cuenta del cliente contando este presupuesto (para el aviso de cargo)
  const clientBalance =
    budgets.filter((x) => entityKey(x.client_name) === entityKey(b.client_name)).reduce((t, x) => t + pendingOf(x), 0) +
    (quote ? balanceOf(b) : 0)

  const toggle = async () => {
    const cancel = isActive(b)
    const { error } = await setBudgetCancelled(b, cancel)
    if (error) return toast(error, "warn")
    toast(cancel ? `Presupuesto ${b.number} cancelado.` : `Presupuesto ${b.number} reactivado.`)
    setConfirm(false)
  }

  return (
    <>
      <PageHeader
        title={`Nº ${b.number}`}
        tail={b.project_name}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/clientes/${entitySlug(entityKey(b.client_name))}`} className="font-semibold text-ink hover:underline">
              {b.client_name}
            </Link>
            <span>· emitido el {dateFmt(b.date)}</span>
            {b.approved_on && isActive(b) && <span>· aprobado el {dateFmt(b.approved_on)}</span>}
            <BudgetTag budget={b} dueDays={settings.due_days} today={t} />
          </span>
        }
        actions={
          <>
            {quote && schemaReady && (
              <button className="btn-red" onClick={() => approve(true)}>
                Aprobar
              </button>
            )}
            {isOpen(b) && (
              <button className="btn-red" onClick={() => openPayment(b.id)}>
                Registrar cobro
              </button>
            )}
            {isActive(b) && (
              <button className="btn-paper" onClick={() => setMailOpen(true)}>
                <Mail className="h-4 w-4" />
                Enviar al cliente
              </button>
            )}
            <button className="btn-paper" onClick={() => printBudget(b, settings)}>
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
            <Link href={`/presupuestos/${b.id}?editar=1`} className="btn-paper">
              <Pencil className="h-4 w-4" />
              Editar
            </Link>
            <Link href={`/presupuestos/nuevo?desde=${b.id}`} className="btn-paper" title="Duplicar">
              <Copy className="h-4 w-4" />
              Duplicar
            </Link>
            {!quote && isActive(b) && b.paid_amount <= 0 && schemaReady && (
              <button className="btn-ghost" onClick={() => approve(false)} title="Vuelve a por aprobar">
                Quitar aprobación
              </button>
            )}
            <button className="btn-ghost" onClick={() => setConfirm(true)}>
              {isActive(b) ? <Ban className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
              {isActive(b) ? "Cancelar" : "Reactivar"}
            </button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]">
        <div className="min-w-0 self-start border-2 border-ink bg-paper-2 p-3 shadow-hard">
          <DocPreview html={html} title={`Presupuesto ${b.number}`} />
        </div>

        <div className="flex flex-col gap-6">
          <section className="border-2 border-ink bg-white shadow-hard">
            <div className={quote ? "border-b-2 border-dashed border-ink bg-white px-4 py-4" : "bg-noche px-4 py-4 text-snow"}>
              <div className={`text-[13px] font-semibold ${quote ? "text-ink-2" : "text-snow-2"}`}>{quote ? "Por aprobar" : "Saldo"}</div>
              <div className="display mt-1 text-[38px]">{usd(pending)}</div>
              {rate && pending > 0 && (
                <div className={`num mt-1 text-[14px] ${quote ? "text-ink-2" : "text-snow-2"}`}>
                  {ves(pending * rate)} · BCV {rateFmt(rate)}
                </div>
              )}
              {quote && <p className="mt-2 text-[13px] text-ink-2">No suma a cuentas por cobrar hasta que el cliente lo apruebe.</p>}
            </div>
            {hasAdvance(b) && isActive(b) && (
              <div className="flex items-center justify-between gap-3 border-b-2 border-ink bg-amber-bg px-4 py-3 text-[14px]">
                <span className="font-semibold">
                  {advanceLabel(b, usd)} · {usd(advanceOf(b))}
                </span>
                <span className={advanceDueOf(b) > 0 ? "font-bold text-amber" : "font-semibold text-green"}>
                  {advanceDueOf(b) > 0 ? `falta ${usd(advanceDueOf(b))}` : "pagado"}
                </span>
              </div>
            )}
            <dl className="grid grid-cols-2 text-[14px]">
              {[
                ["Total", usd(b.total)],
                ["Abonado", usd(b.paid_amount)],
                ["Vence", quote ? "Al aprobar" : dateFmt(due)],
                [
                  isOpen(b) ? (late > 0 ? "Atraso" : "Faltan") : "Estado",
                  isOpen(b) ? `${Math.abs(late)} días` : quote ? "Por aprobar" : isActive(b) ? "Pagado" : "Cancelado",
                ],
              ].map(([k, v], i) => (
                <div key={k} className={`border-t-2 border-ink px-4 py-3 ${i % 2 ? "border-l-2" : ""}`}>
                  <dt className="text-[12.5px] font-semibold text-ink-2">{k}</dt>
                  <dd className={`display-2 mt-1 text-[18px] ${k === "Atraso" ? "text-amber" : ""}`}>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <Panel title="Abonos" aside={<span>{own.length ? plural(own.length, "registrado", "registrados") : ""}</span>} bodyClass="p-0">
            {own.length === 0 ? (
              <p className="px-4 py-5 text-[14px] text-ink-2">Todavía no hay abonos a este presupuesto.</p>
            ) : (
              <ul>
                {own.map((p) => {
                  const r = p.exchange_rate ?? rateOn(p.payment_date)
                  return (
                    <li key={p.id} className="flex items-start justify-between gap-3 border-b border-ink/10 px-4 py-3 last:border-0">
                      <div className="min-w-0 text-[13.5px]">
                        <div className="font-semibold">{dateFmt(p.payment_date)} · {methodLabel(p.payment_method)}</div>
                        <div className="text-ink-2">
                          {p.reference_number ? `Ref. ${p.reference_number}` : "Sin referencia"}
                          {r ? ` · tasa ${rateFmt(r)}` : ""}
                        </div>
                        {p.notes && <div className="mt-1 text-ink-2">{p.notes}</div>}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="num font-bold">{usd(p.amount)}</div>
                        {p.currency === "VES" && p.amount_ves != null ? (
                          <div className="num text-[12.5px] text-ink-2">{ves(p.amount_ves)}</div>
                        ) : r ? (
                          <div className="num text-[12.5px] text-ink-mute" title="Referencia a la tasa BCV de ese día">
                            ≈ {ves(p.amount * r)}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Ítems">
            <ul className="flex flex-col gap-2 text-[13.5px]">
              {b.items.map((i, n) => (
                <li key={i.id ?? n} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className="text-ink-mute">{n + 1}.</span> {i.description}
                  </span>
                  <span className="num shrink-0 text-ink-2">
                    {i.quantity} × {usd(Number(i.rate))}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {mailOpen && (
        <SendDialog
          open
          onClose={() => setMailOpen(false)}
          title={`Enviar el presupuesto ${b.number}`}
          clientName={b.client_name}
          defaultMessage={defaultBudgetMessage(b)}
          payload={{
            build: (message, assets) =>
              budgetEmail({
                doc: b,
                settings,
                message,
                accountBalance: clientBalance,
                pdfName: pdfName(`Presupuesto ${b.number}`, b.project_name),
                assets,
              }),
            pdfHtml: html,
            filename: pdfName(`Presupuesto ${b.number}`, b.project_name),
            log: { kind: "budget", budgetId: b.id, amount: b.total },
          }}
        />
      )}
      {confirm && (
        <Modal
          open
          onOpenChange={setConfirm}
          title={isActive(b) ? `¿Cancelar el ${b.number}?` : `¿Reactivar el ${b.number}?`}
          description={
            isActive(b)
              ? "Deja de contar como cuenta por cobrar y como ingreso. No se borra: puedes reactivarlo cuando quieras."
              : "Vuelve a contar como cuenta por cobrar con su saldo actual."
          }
          footer={
            <>
              <button className="btn-paper" onClick={() => setConfirm(false)}>
                Volver
              </button>
              <button className={isActive(b) ? "btn-ink" : "btn-red"} onClick={toggle}>
                {isActive(b) ? "Cancelar presupuesto" : "Reactivar"}
              </button>
            </>
          }
        >
          <p className="text-[14px]">
            {b.project_name} · {b.client_name} · {usd(b.total)}
          </p>
        </Modal>
      )}
    </>
  )
}

export default function PresupuestoPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<Loading />}>
      <BudgetView id={params.id} />
    </Suspense>
  )
}
