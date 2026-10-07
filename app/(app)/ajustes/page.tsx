"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useData } from "@/hooks/data"
import { useAuth } from "@/hooks/useAuth"
import { useRate } from "@/hooks/rate"
import { Field, PageHeader, Panel, useToast } from "@/components/ui/kit"
import { WeeklyPanel } from "@/components/settings/weekly-panel"
import { dateFmt, rateFmt } from "@/lib/format"
import type { Settings } from "@/lib/types"

interface MailInfo {
  provider: "gmail-supabase" | "gmail" | "resend" | "smtp" | null
  from: string | null
  replyTo: string | null
  resendKey: boolean
  mailFrom: boolean
}

/** Qué servicio de correo usa el servidor: confirma que las variables de Render se aplicaron */
function MailStatus() {
  const [info, setInfo] = useState<MailInfo | "error" | null>(null)
  useEffect(() => {
    fetch("/api/correo")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setInfo)
      .catch(() => setInfo("error"))
  }, [])

  let tag: React.ReactNode = <span className="text-ink-2">Revisando…</span>
  let note: string | null = null
  if (info === "error") tag = <span className="tag-warn">Sin respuesta</span>
  else if (info?.provider === "gmail-supabase" || info?.provider === "gmail") {
    tag = <span className="tag-ok">{info.provider === "gmail" ? "Gmail" : "Gmail · vía Supabase"}</span>
    note = `Sale de ${info.from}; las respuestas te llegan ahí mismo.`
  } else if (info?.provider === "resend") {
    tag = <span className="tag-ok">Resend</span>
    note =
      info.from === "onboarding@resend.dev"
        ? "Sin MAIL_FROM: Resend solo entrega a tu propio correo."
        : `Sale de ${info.from}; respuestas y copias a ${info.replyTo}.`
  } else if (info?.provider === "smtp") {
    tag = <span className="tag-ok">SMTP</span>
    note = `Sale de ${info.from}.`
  } else if (info) {
    tag = <span className="tag-warn">Sin configurar</span>
    note = "Faltan GMAIL_USER y GMAIL_APP_PASSWORD en las variables de entorno."
  }

  return (
    <div>
      <div className="flex justify-between gap-4">
        <dt className="text-ink-2">Envío de correo</dt>
        <dd className="text-right">{tag}</dd>
      </div>
      {note && <p className={`mt-1 text-right text-[12.5px] ${info && info !== "error" && info.provider ? "text-ink-2" : "font-semibold text-amber"}`}>{note}</p>}
    </div>
  )
}

export default function AjustesPage() {
  const { settings, profile, schemaReady, autoReady, saveSettings, saveProfile } = useData()
  const { user, changePassword } = useAuth()
  const { rate, rateDate } = useRate()
  const toast = useToast()

  const [form, setForm] = useState<Settings>(settings)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  const [fullName, setFullName] = useState(profile?.full_name ?? "")
  const [savingProfile, setSavingProfile] = useState(false)

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" })
  const [pwError, setPwError] = useState<string | null>(null)
  const [savingPw, setSavingPw] = useState(false)

  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: k === "due_days" ? Number(e.target.value) : e.target.value }))

  const submitSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSettingsError(null)
    setSavingSettings(true)
    // Este formulario solo edita los datos de los PDF: el envío semanal se guarda en su panel
    const { error } = await saveSettings({
      ...form,
      statement_auto: settings.statement_auto,
      statement_weekday: settings.statement_weekday,
      statement_hour: settings.statement_hour,
      statement_scope: settings.statement_scope,
      app_url: settings.app_url,
    })
    setSavingSettings(false)
    if (error) return setSettingsError(error)
    toast("Datos de los PDF guardados.")
  }

  const submitProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    const { error } = await saveProfile(fullName)
    setSavingProfile(false)
    toast(error ?? "Perfil guardado.", error ? "warn" : "ok")
  }

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError(null)
    if (pw.next.length < 8) return setPwError("La nueva contraseña debe tener al menos 8 caracteres.")
    if (pw.next !== pw.confirm) return setPwError("La confirmación no coincide.")
    setSavingPw(true)
    const { error } = await changePassword(pw.current, pw.next)
    setSavingPw(false)
    if (error) return setPwError(error)
    setPw({ current: "", next: "", confirm: "" })
    toast("Contraseña actualizada.")
  }

  return (
    <>
      <PageHeader title="Ajustes" tail="del sistema." meta={user?.email} />

      <div className="grid gap-6 xl:grid-cols-12">
        <WeeklyPanel className="xl:col-span-12" />

        <Panel className="xl:col-span-7" title="Datos que salen en los PDF" shadow>
          {!schemaReady && (
            <p className="mb-4 border-2 border-amber bg-amber-bg px-3 py-2.5 text-[13.5px] text-ink-2">
              <b className="text-amber">Solo lectura por ahora.</b> Para editarlos hay que aplicar la migración{" "}
              <code className="font-mono text-[12.5px]">scripts/11-cobros-bs-aprobacion-y-seguridad.sql</code>. Los PDF usan estos valores.
            </p>
          )}
          <form onSubmit={submitSettings} className="grid gap-4">
            <fieldset disabled={!schemaReady} className="grid gap-4 disabled:opacity-60">
              <Field label="Nombre en el pie de página" htmlFor="s-company" hint="Vacío = Apex Consulting">
                <input id="s-company" className="input" value={form.company_name} onChange={set("company_name")} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Teléfono (pago móvil)" htmlFor="s-phone">
                  <input id="s-phone" className="input num" value={form.payment_phone} onChange={set("payment_phone")} />
                </Field>
                <Field label="Banco" htmlFor="s-bank">
                  <input id="s-bank" className="input" value={form.payment_bank} onChange={set("payment_bank")} />
                </Field>
                <Field label="Número de cuenta" htmlFor="s-account" hint="Los 20 dígitos, sin espacios">
                  <input id="s-account" className="input num" inputMode="numeric" value={form.payment_account} onChange={set("payment_account")} />
                </Field>
                <Field label="Cédula o RIF" htmlFor="s-id">
                  <input id="s-id" className="input num" value={form.payment_id_number} onChange={set("payment_id_number")} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_1fr_150px]">
                <Field label="Correo de contacto" htmlFor="s-email">
                  <input id="s-email" type="email" className="input" value={form.contact_email} onChange={set("contact_email")} />
                </Field>
                <Field label="Sitio web" htmlFor="s-web">
                  <input id="s-web" className="input" value={form.website} onChange={set("website")} />
                </Field>
                <Field label="Vence a los (días)" htmlFor="s-due">
                  <input id="s-due" type="number" min={1} max={120} className="input num" value={form.due_days} onChange={set("due_days")} />
                </Field>
              </div>
            </fieldset>
            {settingsError && <p className="border-2 border-amber bg-amber-bg px-3 py-2 text-[13.5px] font-semibold text-amber">{settingsError}</p>}
            <div>
              <button type="submit" className="btn-red" disabled={!schemaReady || savingSettings}>
                {savingSettings ? "Guardando…" : "Guardar datos"}
              </button>
            </div>
          </form>
        </Panel>

        <div className="flex flex-col gap-6 xl:col-span-5">
          <Panel title="Tu perfil">
            <form onSubmit={submitProfile} className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <Field label="Nombre" htmlFor="p-name" className="flex-1">
                <input id="p-name" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </Field>
              <button type="submit" className="btn-ink" disabled={savingProfile}>
                Guardar
              </button>
            </form>
          </Panel>

          <Panel title="Contraseña">
            <form onSubmit={submitPassword} className="grid gap-4">
              <Field label="Contraseña actual" htmlFor="pw-current">
                <input
                  id="pw-current"
                  type="password"
                  className="input"
                  autoComplete="current-password"
                  value={pw.current}
                  onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
                  required
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nueva" htmlFor="pw-next" hint="Mínimo 8 caracteres">
                  <input
                    id="pw-next"
                    type="password"
                    className="input"
                    autoComplete="new-password"
                    value={pw.next}
                    onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
                    required
                  />
                </Field>
                <Field label="Repite la nueva" htmlFor="pw-confirm">
                  <input
                    id="pw-confirm"
                    type="password"
                    className="input"
                    autoComplete="new-password"
                    value={pw.confirm}
                    onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
                    required
                  />
                </Field>
              </div>
              {pwError && <p className="border-2 border-amber bg-amber-bg px-3 py-2 text-[13.5px] font-semibold text-amber">{pwError}</p>}
              <div>
                <button type="submit" className="btn-ink" disabled={savingPw}>
                  {savingPw ? "Cambiando…" : "Cambiar contraseña"}
                </button>
              </div>
            </form>
          </Panel>

          <Panel title="Sistema">
            <dl className="grid gap-3 text-[14px]">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2">Tasa BCV</dt>
                <dd className="num text-right font-semibold">
                  {rate ? `${rateFmt(rate)} Bs/$` : "Sin respuesta"}
                  {rateDate && <span className="font-normal text-ink-2"> · {dateFmt(rateDate)}</span>}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2">Fuente de la tasa</dt>
                <dd className="text-right">BCV, vía DolarApi (se actualiza cada 30 min)</dd>
              </div>
              <MailStatus />
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2">Base de datos</dt>
                <dd className="flex flex-wrap justify-end gap-1.5 text-right">
                  {schemaReady ? <span className="tag-ok">Migración 11 aplicada</span> : <span className="tag-warn">Falta la migración 11</span>}
                  {autoReady ? <span className="tag-ok">Migración 12 aplicada</span> : <span className="tag-warn">Falta la migración 12</span>}
                </dd>
              </div>
              <div className="border-t border-ink/15 pt-3 text-[13px] text-ink-2">
                Los módulos de facturas y de control de horas se retiraron de la aplicación. Sus tablas y datos siguen intactos en la base de
                datos.
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </>
  )
}
