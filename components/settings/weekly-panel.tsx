"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { FlaskConical } from "lucide-react"
import { useData } from "@/hooks/data"
import { useAuth } from "@/hooks/useAuth"
import { Field, Panel, Segmented, useToast } from "@/components/ui/kit"
import { entitySlug } from "@/lib/entities"
import { EPS } from "@/lib/metrics"
import { plural, usd } from "@/lib/format"
import { WEEKDAYS, type StatementScope } from "@/lib/types"
import { caracasLabel, caracasToday, hourLabel, nextWeeklyRun, weeklyPlan } from "@/lib/weekly"
import { cn } from "@/lib/utils"

/* Lunes primero, como se lee una semana de trabajo */
const DAYS = [1, 2, 3, 4, 5, 6, 0]
const HOURS = Array.from({ length: 24 }, (_, h) => h)

/** Envío automático semanal del estado de cuenta: cuándo sale, a quién y qué se mandó */
export function WeeklyPanel({ className }: { className?: string }) {
  const { settings, saveSettings, autoReady, budgets, payments, clients, emailLog, reloadEmailLog } = useData()
  const { user } = useAuth()
  const toast = useToast()

  const [form, setForm] = useState({
    statement_auto: settings.statement_auto,
    statement_weekday: settings.statement_weekday,
    statement_hour: settings.statement_hour,
    statement_scope: settings.statement_scope,
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k] !== settings[k])

  const day = caracasToday()
  const plan = useMemo(
    () => weeklyPlan({ budgets, payments, clients, settings: { ...settings, ...form }, today: day }),
    [budgets, payments, clients, settings, form, day],
  )
  const auto = emailLog.filter((l) => l.origin !== "manual")
  const doneToday = auto.some((l) => l.origin === "auto" && caracasToday(new Date(l.created_at)) === day)
  const next = nextWeeklyRun(form, { doneToday })
  const total = plan.send.reduce((t, x) => t + (x.late > EPS ? x.late : x.due), 0)
  const onLocalhost = typeof window !== "undefined" && window.location.protocol !== "https:"

  const save = async () => {
    setError(null)
    setSaving(true)
    const { error } = await saveSettings({ ...settings, ...form })
    setSaving(false)
    if (error) return setError(error)
    toast(form.statement_auto ? `Envío semanal activo: ${caracasLabel(next)}.` : "Envío semanal apagado.")
  }

  const test = async () => {
    setError(null)
    setTesting(true)
    try {
      const res = await fetch("/api/estados-semanales/prueba", { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "No se pudo enviar la prueba.")
      await reloadEmailLog()
      toast(
        json.failed
          ? `Salieron ${json.sent} y fallaron ${json.failed}: revisa el registro.`
          : `Te llegaron ${plural(json.sent, "correo de prueba", "correos de prueba")} a ${json.to}.`,
        json.failed ? "warn" : "ok",
      )
    } catch (e: any) {
      setError(e.message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Panel
      id="envio-semanal"
      className={className}
      title="Estado de cuenta automático"
      aside={<span>Cada semana, con el PDF adjunto, a todos los correos de cada cliente</span>}
      shadow
      bodyClass="p-0"
    >
      {!autoReady && (
        <p className="border-b-2 border-ink bg-amber-bg px-4 py-3 text-[13.5px] text-ink-2">
          <b className="text-amber">Todavía no disponible.</b> Se activa al aplicar{" "}
          <code className="font-mono text-[12.5px]">scripts/12-contactos-y-estado-de-cuenta-semanal.sql</code>.
        </p>
      )}
      <div className="grid xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Programación */}
        <fieldset disabled={!autoReady} className="grid content-start gap-4 p-4 disabled:opacity-60 xl:border-r-2 xl:border-ink">
          <Segmented
            className="justify-self-start"
            value={form.statement_auto ? "on" : "off"}
            onChange={(v) => set("statement_auto", v === "on")}
            options={[
              { value: "off", label: "Apagado" },
              { value: "on", label: "Activo" },
            ]}
          />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Día" htmlFor="w-day">
              <select
                id="w-day"
                className="input"
                value={form.statement_weekday}
                onChange={(e) => set("statement_weekday", Number(e.target.value))}
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {WEEKDAYS[d]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hora (Caracas)" htmlFor="w-hour">
              <select id="w-hour" className="input" value={form.statement_hour} onChange={(e) => set("statement_hour", Number(e.target.value))}>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div>
            <span className="field-label">A quién</span>
            <Segmented<StatementScope>
              value={form.statement_scope}
              onChange={(v) => set("statement_scope", v)}
              size="sm"
              options={[
                { value: "late", label: "Solo con vencido" },
                { value: "open", label: "Todos con saldo" },
              ]}
            />
          </div>

          <div
            className={cn(
              "border-2 px-3 py-2.5 text-[13.5px]",
              form.statement_auto ? "border-ink bg-noche text-snow" : "border-dashed border-ink/40 text-ink-2",
            )}
          >
            {form.statement_auto ? (
              <>
                <div className="text-[12px] font-semibold text-snow-2">Próximo envío</div>
                <div className="display-2 mt-0.5 text-[18px] first-letter:uppercase">{caracasLabel(next)}</div>
              </>
            ) : (
              "Apagado: no sale nada hasta que lo actives y guardes."
            )}
          </div>

          {autoReady && !settings.app_url && (
            <p className="border-2 border-amber bg-amber-bg px-3 py-2 text-[13px] text-ink-2">
              <b className="text-amber">Falta un paso:</b> abre la app una vez desde su dirección publicada (Render, con https) y queda
              registrada sola. Desde ahí se procesa el envío{onLocalhost ? "; en localhost no se registra" : ""}.
            </p>
          )}
          {autoReady && settings.app_url && (
            <p className="text-[12.5px] text-ink-2">
              Se procesa desde <b className="text-ink">{settings.app_url}</b>. Te llega una copia oculta de cada correo.
            </p>
          )}
          {error && <p className="border-2 border-amber bg-amber-bg px-3 py-2 text-[13.5px] font-semibold text-amber">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-red" onClick={save} disabled={saving || !dirty}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              className="btn-paper"
              onClick={test}
              disabled={testing || plan.send.length === 0}
              title={user?.email ? `Todos los correos de esta semana, solo a ${user.email}` : undefined}
            >
              <FlaskConical className="h-4 w-4" />
              {testing ? "Enviando prueba…" : "Enviarme una prueba"}
            </button>
          </div>
        </fieldset>

        {/* Lo que saldría hoy */}
        <div className="min-w-0 border-t-2 border-ink xl:border-t-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink px-4 py-3">
            <h3 className="display-2 text-[16px]">Si saliera hoy</h3>
            <span className="text-[13px] text-ink-2">
              {plural(plan.send.length, "cliente", "clientes")} · <b className="num text-ink">{usd(total)}</b>
            </span>
          </div>
          {plan.send.length === 0 ? (
            <p className="px-4 py-5 text-[14px] text-ink-2">
              {form.statement_scope === "late" ? "Nadie tiene saldos vencidos con correo guardado." : "Nadie tiene saldo con correo guardado."}
            </p>
          ) : (
            <div className="max-h-[300px] overflow-auto">
              <table className="tbl">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <th>Cliente</th>
                    <th>Para</th>
                    <th className="r">Vencido</th>
                    <th className="r">A pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.send.map((x) => (
                    <tr key={x.key}>
                      <td className="max-w-[200px]">
                        <Link href={`/clientes/${entitySlug(x.key)}`} className="block truncate font-semibold hover:underline">
                          {x.name}
                        </Link>
                      </td>
                      <td className="max-w-[240px] text-[13px] text-ink-2">
                        <span className="block truncate" title={x.recipients.join(", ")}>
                          {x.recipients[0]}
                          {x.recipients.length > 1 && ` +${x.recipients.length - 1}`}
                        </span>
                      </td>
                      <td className={cn("r num font-semibold", x.late > EPS && "text-amber")}>{x.late > EPS ? usd(x.late) : "—"}</td>
                      <td className="r num">{usd(x.due)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {plan.skipped.length > 0 && (
            <div className="border-t-2 border-ink bg-amber-bg px-4 py-2.5 text-[13px] text-ink-2">
              <b className="text-amber">No les llega:</b>{" "}
              {plan.skipped.map((x, i) => (
                <span key={x.key}>
                  {i > 0 && " · "}
                  <Link href={`/clientes/${entitySlug(x.key)}`} className="font-semibold text-ink underline">
                    {x.name}
                  </Link>{" "}
                  ({x.skip === "sin-correo" ? "sin correo" : "desactivado en su ficha"})
                </span>
              ))}
            </div>
          )}

          <div className="border-t-2 border-ink px-4 py-3">
            <h3 className="display-2 text-[16px]">Últimos envíos automáticos</h3>
          </div>
          {auto.length === 0 ? (
            <p className="px-4 pb-4 text-[13.5px] text-ink-2">Todavía no ha salido ninguno.</p>
          ) : (
            <ul className="max-h-[260px] overflow-auto border-t border-ink/10">
              {auto.slice(0, 30).map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-ink/10 px-4 py-2 text-[13px]">
                  <span className="min-w-0">
                    <b>{l.client_name}</b>
                    <span className="text-ink-2">
                      {" "}
                      · {new Date(l.created_at).toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" })}
                      {" · "}
                      {l.recipients.join(", ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {l.amount != null && <span className="num font-semibold">{usd(l.amount)}</span>}
                    {l.origin === "test" && <span className="tag-quote">Prueba</span>}
                    {l.status === "error" ? (
                      <span className="tag-late" title={l.error ?? ""}>
                        Falló
                      </span>
                    ) : (
                      <span className="tag-ok">Enviado</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  )
}
