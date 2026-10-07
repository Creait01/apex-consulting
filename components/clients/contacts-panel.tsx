"use client"

import type React from "react"
import { useState } from "react"
import Link from "next/link"
import { Plus, X } from "lucide-react"
import { useData } from "@/hooks/data"
import { Panel, useToast } from "@/components/ui/kit"
import { EMAIL_RE } from "@/lib/rows"
import { entityKey } from "@/lib/entities"
import { WEEKDAYS, type Contact } from "@/lib/types"
import { hourLabel } from "@/lib/weekly"
import { dateFmt, dayKey, usd } from "@/lib/format"
import { cn } from "@/lib/utils"

const ORIGIN = { manual: "A mano", auto: "Automático", test: "Prueba" } as const

/** Correos de contacto del cliente, su envío semanal y los últimos correos que se le mandaron */
export function ContactsPanel({ clientName, className }: { clientName: string; className?: string }) {
  const { clientFor, saveClient, autoReady, settings, emailLog } = useData()
  const toast = useToast()
  const record = clientFor(clientName)
  const contacts = record?.contacts ?? []
  const auto = record ? record.auto_statement : true

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (next: Contact[], done: string) => {
    setBusy(true)
    const { error } = await saveClient(clientName, { contacts: next })
    setBusy(false)
    if (error) {
      setError(error)
      return false
    }
    setError(null)
    toast(done)
    return true
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const address = email.trim().toLowerCase()
    if (!EMAIL_RE.test(address)) return setError("Escribe un correo válido.")
    if (contacts.some((c) => c.email === address)) return setError("Ese correo ya está en la lista.")
    if (await save([...contacts, { name: name.trim(), email: address }], `${address} agregado.`)) {
      setName("")
      setEmail("")
    }
  }

  const remove = (c: Contact) => save(contacts.filter((x) => x.email !== c.email), `${c.email} quitado.`)

  // Se marca al instante; si no se puede guardar vuelve a como estaba
  const [pendingAuto, setPendingAuto] = useState<boolean | null>(null)
  const setAuto = async (value: boolean) => {
    setPendingAuto(value)
    const { error } = await saveClient(clientName, { auto_statement: value })
    setPendingAuto(null)
    toast(error ?? (value ? "Recibirá el estado de cuenta cada semana." : "Ya no recibirá el estado de cuenta automático."), error ? "warn" : "ok")
  }
  const autoShown = pendingAuto ?? auto

  const key = entityKey(clientName)
  const sends = emailLog.filter((l) => entityKey(l.client_name) === key).slice(0, 5)
  const schedule = settings.statement_auto
    ? `Sale los ${WEEKDAYS[settings.statement_weekday].toLowerCase()} a las ${hourLabel(settings.statement_hour)}${
        settings.statement_scope === "late" ? ", solo si tiene algo vencido" : ""
      }.`
    : null

  return (
    <Panel
      className={className}
      title="Correos de contacto"
      aside={<span>Les llegan los presupuestos y los estados de cuenta</span>}
      bodyClass="p-0"
    >
      <div className="flex flex-wrap gap-2.5 p-4">
        {contacts.length === 0 && (
          <p className="border-2 border-dashed border-amber bg-amber-bg px-3 py-2 text-[13.5px] text-ink-2">
            Sin correos todavía: agrega al menos uno para enviarle presupuestos y estados de cuenta.
          </p>
        )}
        {contacts.map((c) => (
          <div key={c.email} className="flex max-w-full items-stretch border-2 border-ink bg-white shadow-hard-sm">
            <div className="min-w-0 px-3 py-1.5">
              <div className="text-[11.5px] font-semibold text-ink-2">{c.name || "Contacto"}</div>
              <div className="truncate text-[14px] font-semibold">{c.email}</div>
            </div>
            <button
              type="button"
              onClick={() => remove(c)}
              disabled={busy}
              className="grid w-9 shrink-0 place-items-center border-l-2 border-ink hover:bg-red hover:text-white disabled:opacity-40"
              aria-label={`Quitar ${c.email}`}
              title="Quitar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={add} className="grid gap-2 border-t-2 border-ink px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]">
        <input
          className="input h-9 text-[14px]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre o cargo (opcional)"
          aria-label="Nombre del contacto"
        />
        <input
          className="input h-9 text-[14px]"
          type="text"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="correo@cliente.com"
          aria-label="Correo del contacto"
        />
        <button type="submit" className="btn-ink h-9" disabled={busy || !email.trim()}>
          <Plus className="h-4 w-4" />
          Agregar
        </button>
        {error && <p className="text-[13px] font-semibold text-amber sm:col-span-3">{error}</p>}
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t-2 border-ink bg-paper px-4 py-3 text-[14px]">
        <label className={cn("flex items-center gap-2 font-semibold", autoReady ? "cursor-pointer" : "opacity-50")}>
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#0E1422]"
            checked={autoShown}
            disabled={!autoReady || pendingAuto !== null}
            onChange={(e) => setAuto(e.target.checked)}
          />
          Estado de cuenta automático cada semana
        </label>
        <span className="text-[13px] text-ink-2">
          {!autoReady ? (
            "Se activa con la migración 12."
          ) : !autoShown ? (
            "Este cliente no lo recibe."
          ) : schedule ? (
            schedule
          ) : (
            <>
              El envío automático está apagado:{" "}
              <Link href="/ajustes#envio-semanal" className="font-semibold text-ink underline">
                actívalo en Ajustes
              </Link>
              .
            </>
          )}
        </span>
      </div>

      {sends.length > 0 && (
        <ul className="border-t-2 border-ink">
          {sends.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-ink/10 px-4 py-2 text-[13px] last:border-0">
              <span className="min-w-0">
                <b>{l.kind === "budget" ? "Presupuesto" : "Estado de cuenta"}</b>
                <span className="text-ink-2">
                  {" "}
                  · {dateFmt(dayKey(new Date(l.created_at)))} · {l.recipients.join(", ")}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {l.amount != null && <span className="num font-semibold">{usd(l.amount)}</span>}
                <span className={l.origin === "auto" ? "tag-ink" : "tag-quote"}>{ORIGIN[l.origin]}</span>
                {l.status === "error" ? <span className="tag-late" title={l.error ?? ""}>Falló</span> : <span className="tag-ok">Enviado</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
