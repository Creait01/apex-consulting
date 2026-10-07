"use client"

import type React from "react"
import { useMemo, useState } from "react"
import { Check, Send } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { Field, Segmented, useToast } from "@/components/ui/kit"
import { useData } from "@/hooks/data"
import { useAuth } from "@/hooks/useAuth"
import { CID_ASSETS, PREVIEW_ASSETS, type EmailAssets, type EmailContent } from "@/lib/emails"
import { EMAIL_RE, splitEmails } from "@/lib/rows"
import { plural } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface SendPayload {
  /** Arma el correo con el mensaje escrito; assets = dónde están las imágenes del logo */
  build: (message: string, assets: EmailAssets) => EmailContent
  /** HTML del documento que va como PDF adjunto */
  pdfHtml: string
  filename: string
  /** Para el registro de envíos */
  log: { kind: "statement" | "budget"; budgetId?: string | null; amount?: number | null }
}

/** Diálogo para enviar un estado de cuenta o un presupuesto por correo a los contactos del cliente */
export function SendDialog({
  open,
  onClose,
  title,
  clientName,
  defaultMessage,
  payload,
}: {
  open: boolean
  onClose: () => void
  title: string
  clientName: string
  defaultMessage: string
  payload: SendPayload
}) {
  const { contactsFor, saveClient, reloadEmailLog } = useData()
  const { user } = useAuth()
  const toast = useToast()
  const saved = contactsFor(clientName)

  // Todos los contactos guardados van marcados; se puede quitar alguno solo para este envío
  const [picked, setPicked] = useState<Set<string>>(() => new Set(saved.map((c) => c.email)))
  const [extra, setExtra] = useState("")
  const [cc, setCc] = useState("")
  const [message, setMessage] = useState(defaultMessage)
  const [copyMe, setCopyMe] = useState(true)
  const [remember, setRemember] = useState(true)
  const [view, setView] = useState<"form" | "preview">("form")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const extraList = Array.from(new Set(splitEmails(extra).map((e) => e.toLowerCase())))
  const fresh = extraList.filter((e) => !saved.some((c) => c.email === e))
  const to = Array.from(new Set([...saved.filter((c) => picked.has(c.email)).map((c) => c.email), ...extraList]))

  // Vista previa con las imágenes de la app; el correo enviado las lleva incrustadas (cid)
  const email = useMemo(() => payload.build(message, PREVIEW_ASSETS), [payload, message])
  const [subject, setSubject] = useState(email.subject)

  const toggle = (address: string) =>
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(address)) next.delete(address)
      else next.add(address)
      return next
    })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const bad = [...extraList, ...splitEmails(cc)].filter((x) => !EMAIL_RE.test(x))
    if (bad.length) return setError(`Revisa: «${bad[0]}» no es un correo válido.`)
    if (!to.length) return setError("Marca o escribe al menos un correo.")
    setSending(true)
    try {
      const res = await fetch("/api/enviar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to,
          cc,
          copyMe,
          subject,
          emailHtml: payload.build(message, CID_ASSETS).html,
          emailText: email.text,
          attachPdf: true,
          pdfHtml: payload.pdfHtml,
          filename: payload.filename,
          log: { ...payload.log, clientName },
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "No se pudo enviar el correo.")
      if (remember && fresh.length) {
        const { error } = await saveClient(clientName, { contacts: [...saved, ...fresh.map((address) => ({ name: "", email: address }))] })
        if (error) toast(error, "warn")
      }
      reloadEmailLog()
      toast(to.length === 1 ? `Enviado a ${to[0]}.` : `Enviado a ${plural(to.length, "correo", "correos")}.`)
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={`Un aviso con la marca y el PDF adjunto: ${payload.filename}`}
      className="w-[min(96vw,760px)]"
      footer={
        <>
          <button type="button" className="btn-paper" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="send-form" className="btn-red" disabled={sending || !to.length}>
            <Send className="h-4 w-4" />
            {sending ? "Generando PDF y enviando…" : to.length > 1 ? `Enviar a ${to.length} correos` : "Enviar"}
          </button>
        </>
      }
    >
      <div className="mb-4">
        <Segmented
          value={view}
          onChange={setView}
          size="sm"
          options={[
            { value: "form", label: "Correo" },
            { value: "preview", label: "Así lo recibe el cliente" },
          ]}
        />
      </div>

      {view === "preview" && (
        <div className="border-2 border-ink bg-white">
          <div className="border-b-2 border-ink bg-paper px-3 py-2 text-[13px]">
            <b>{subject}</b>
            <div className="text-ink-2">Para: {to.join(", ") || "—"}</div>
          </div>
          <iframe title="Vista previa del correo" srcDoc={email.html} className="h-[560px] w-full border-0" />
        </div>
      )}
      {/* El formulario sigue montado en la vista previa: el botón Enviar lo usa */}
      <form id="send-form" onSubmit={submit} className={view === "preview" ? "hidden" : "grid gap-4"}>
        <div>
          <span className="field-label">Para</span>
          {saved.length > 0 ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Contactos del cliente">
              {saved.map((c) => {
                const on = picked.has(c.email)
                return (
                  <button
                    key={c.email}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(c.email)}
                    className={cn(
                      "flex max-w-full items-center gap-2 border-2 px-2.5 py-1.5 text-left text-[13.5px] transition-colors",
                      on ? "border-ink bg-ink text-paper" : "border-dashed border-ink/50 bg-white text-ink-mute line-through",
                    )}
                  >
                    <span className={cn("grid h-4 w-4 shrink-0 place-items-center border-2", on ? "border-paper bg-red" : "border-ink/40")}>
                      {on && <Check className="h-3 w-3 text-white" strokeWidth={3.5} />}
                    </span>
                    <span className="min-w-0 truncate">
                      {c.name && <b className="font-semibold">{c.name} · </b>}
                      {c.email}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="border-2 border-dashed border-amber bg-amber-bg px-3 py-2 text-[13.5px] text-ink-2">
              {clientName} no tiene correos guardados. Escríbelos abajo y quedan en su ficha.
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={saved.length ? "Otros correos (opcional)" : "Correos del cliente"}
            htmlFor="mail-to"
            hint="Varios separados por coma"
          >
            <input
              id="mail-to"
              type="text"
              inputMode="email"
              className="input"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="pagos@cliente.com, gerencia@cliente.com"
              autoFocus={!saved.length}
            />
          </Field>
          <Field label="Con copia a (opcional)" htmlFor="mail-cc" hint="No se guardan en la ficha">
            <input id="mail-cc" type="text" inputMode="email" className="input" value={cc} onChange={(e) => setCc(e.target.value)} />
          </Field>
        </div>
        <Field label="Asunto" htmlFor="mail-subject">
          <input id="mail-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </Field>
        <Field label="Mensaje" htmlFor="mail-message" hint="Va después de «Saludos, cliente». Debajo van el monto, la lista y los datos de pago.">
          <textarea id="mail-message" className="input" rows={8} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[#0E1422]" checked={copyMe} onChange={(e) => setCopyMe(e.target.checked)} />
            Enviarme una copia{user?.email ? ` (${user.email})` : ""}
          </label>
          {fresh.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-[#0E1422]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Guardar {fresh.length === 1 ? "el correo nuevo" : `los ${fresh.length} correos nuevos`} en la ficha de {clientName}
            </label>
          )}
        </div>
        {error && <p className="border-2 border-amber bg-amber-bg px-3 py-2 text-[13.5px] font-semibold text-amber">{error}</p>}
      </form>
      {view === "preview" && error && (
        <p className="mt-3 border-2 border-amber bg-amber-bg px-3 py-2 text-[13.5px] font-semibold text-amber">{error}</p>
      )}
    </Modal>
  )
}
