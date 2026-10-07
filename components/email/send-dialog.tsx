"use client"

import type React from "react"
import { useMemo, useState } from "react"
import { Send } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { Field, Segmented, useToast } from "@/components/ui/kit"
import { useData } from "@/hooks/data"
import { useAuth } from "@/hooks/useAuth"
import { CID_ASSETS, PREVIEW_ASSETS, type EmailAssets, type EmailContent } from "@/lib/emails"

export interface SendPayload {
  /** Arma el correo con el mensaje escrito; assets = dónde están las imágenes del logo */
  build: (message: string, assets: EmailAssets) => EmailContent
  /** HTML del documento que va como PDF adjunto */
  pdfHtml: string
  filename: string
}

/** Diálogo para enviar un estado de cuenta o un presupuesto por correo */
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
  const { emailFor, saveClientEmail } = useData()
  const { user } = useAuth()
  const toast = useToast()
  const saved = emailFor(clientName)

  const [to, setTo] = useState(saved)
  const [cc, setCc] = useState("")
  const [message, setMessage] = useState(defaultMessage)
  const [copyMe, setCopyMe] = useState(true)
  const [remember, setRemember] = useState(true)
  // El aviso siempre menciona el PDF: va siempre adjunto
  const attachPdf = true
  const [view, setView] = useState<"form" | "preview">("form")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Vista previa con las imágenes de la app; el correo enviado las lleva incrustadas (cid)
  const email = useMemo(() => payload.build(message, PREVIEW_ASSETS), [payload, message])
  const [subject, setSubject] = useState(email.subject)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!to.trim()) return setError("Indica el correo del cliente.")
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
          attachPdf,
          pdfHtml: attachPdf ? payload.pdfHtml : "",
          filename: payload.filename,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "No se pudo enviar el correo.")
      const first = to.split(/[,;]/)[0].trim()
      if (remember && first && first !== saved) await saveClientEmail(clientName, first)
      toast(`Enviado a ${to}.`)
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
          <button type="submit" form="send-form" className="btn-red" disabled={sending}>
            <Send className="h-4 w-4" />
            {sending ? "Generando PDF y enviando…" : "Enviar"}
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
            <div className="text-ink-2">Para: {to || "—"}</div>
          </div>
          <iframe title="Vista previa del correo" srcDoc={email.html} className="h-[560px] w-full border-0" />
        </div>
      )}
      {/* El formulario sigue montado en la vista previa: el botón Enviar lo usa */}
      <form id="send-form" onSubmit={submit} className={view === "preview" ? "hidden" : "grid gap-4"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Para" htmlFor="mail-to" hint={saved ? "Correo guardado del cliente" : "Este cliente no tiene correo guardado"}>
              <input
                id="mail-to"
                type="text"
                inputMode="email"
                className="input"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="cliente@empresa.com"
                required
              />
            </Field>
            <Field label="Con copia a (opcional)" htmlFor="mail-cc" hint="Varios correos separados por coma">
              <input id="mail-cc" type="text" inputMode="email" className="input" value={cc} onChange={(e) => setCc(e.target.value)} />
            </Field>
          </div>
          <Field label="Asunto" htmlFor="mail-subject">
            <input id="mail-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </Field>
          <Field label="Mensaje" htmlFor="mail-message" hint="Va después de «Saludos, cliente». Debajo van el monto, la lista y los datos de pago.">
            <textarea id="mail-message" className="input" rows={9} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-[#0E1422]" checked={copyMe} onChange={(e) => setCopyMe(e.target.checked)} />
              Enviarme una copia{user?.email ? ` (${user.email})` : ""}
            </label>
            {to.trim() && to.split(/[,;]/)[0].trim() !== saved && (
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-[#0E1422]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Guardar como correo de {clientName}
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
