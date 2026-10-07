"use client"

import type React from "react"
import { createContext, useCallback, useContext, useState } from "react"
import { cn } from "@/lib/utils"
import type { Budget } from "@/lib/types"
import { payState, isLate } from "@/lib/metrics"

/* ---------- Encabezado de página: titular de marca en dos tiempos ---------- */

export function PageHeader({
  title,
  tail,
  meta,
  actions,
}: {
  title: string
  /** El remate atenuado del titular (manual §3: "Un solo dato, en todos lados.") */
  tail?: string
  meta?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <header className="mb-7 flex flex-col gap-5 border-b-2 border-ink pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="display text-[38px] sm:text-[48px] xl:text-[56px]">
          {title}
          {tail && <span className="text-ink-mute"> {tail}</span>}
        </h1>
        {meta && <div className="mt-3 text-[15px] text-ink-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  )
}

/* ---------- Paneles ---------- */

export function Panel({
  title,
  aside,
  children,
  className,
  bodyClass,
  shadow = false,
  id,
}: {
  title?: React.ReactNode
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClass?: string
  shadow?: boolean
  id?: string
}) {
  return (
    <section id={id} className={cn("border-2 border-ink bg-white", shadow && "shadow-hard", className)}>
      {(title || aside) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink px-4 py-3">
          {title && <h2 className="display-2 text-[19px]">{title}</h2>}
          {aside && <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">{aside}</div>}
        </div>
      )}
      <div className={cn("p-4", bodyClass)}>{children}</div>
    </section>
  )
}

/* ---------- Indicadores ---------- */

export function Stat({
  label,
  value,
  valueClass,
  sub,
  tone = "paper",
  className,
  marker,
}: {
  label: string
  /** La cifra; su tamaño se ajusta al ancho de la tarjeta según su largo */
  value: string
  valueClass?: string
  sub?: React.ReactNode
  tone?: "paper" | "night" | "amber"
  className?: string
  /** Marca el dato principal con el triángulo rojo del logo */
  marker?: boolean
}) {
  // Mona Sans 125/850: cada carácter ocupa ~0,72 em; se reparte el ancho útil entre los caracteres
  const fit = `clamp(18px, ${(128 / Math.max(value.length, 7)).toFixed(2)}cqi, 36px)`
  return (
    <div
      className={cn(
        "relative flex min-h-[132px] flex-col justify-between border-2 border-ink p-4 shadow-hard",
        tone === "paper" && "bg-white",
        tone === "night" && "bg-noche text-snow",
        tone === "amber" && "bg-amber-bg",
        className,
      )}
      style={{ containerType: "inline-size" }}
    >
      <div className={cn("flex items-center gap-2 text-[13.5px] font-semibold", tone === "night" ? "text-snow-2" : "text-ink-2")}>
        {marker && <Triangle />}
        {label}
      </div>
      <div className={cn("display mt-3 whitespace-nowrap leading-none", valueClass)} style={{ fontSize: fit }}>
        {value}
      </div>
      {sub && (
        <div className={cn("mt-2.5 text-[13px] leading-snug", tone === "night" ? "text-snow-2" : "text-ink-2")}>{sub}</div>
      )}
    </div>
  )
}

export const Triangle = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 12 10" className={cn("h-2.5 w-3 shrink-0", className)} aria-hidden="true">
    <path d="M6 0 L0 10 L12 10 Z" fill="#E8380D" />
  </svg>
)

/* ---------- Campos ---------- */

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: string
  hint?: React.ReactNode
  error?: string | null
  children: React.ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="field-label">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[12.5px] font-semibold text-amber">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12.5px] text-ink-2">{hint}</p>
      ) : null}
    </div>
  )
}

/** Selector de opciones excluyentes (pestañas duras) */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: React.ReactNode }[]
  className?: string
  size?: "sm" | "md"
}) {
  return (
    <div role="radiogroup" className={cn("inline-flex border-2 border-ink bg-white", className)}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "font-semibold transition-colors",
            size === "md" ? "h-9 px-3.5 text-[14px]" : "h-8 px-2.5 text-[13px]",
            i > 0 && "border-l-2 border-ink",
            value === o.value ? "bg-ink text-paper" : "text-ink hover:bg-paper",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Estado de un presupuesto ---------- */

export function BudgetTag({ budget, dueDays, today }: { budget: Budget; dueDays: number; today: string }) {
  const state = payState(budget)
  if (state === "cancelled") return <span className="tag-off">Cancelado</span>
  if (state === "quote") return <span className="tag-quote">Por aprobar</span>
  if (state === "paid") return <span className="tag-ok">Pagado</span>
  if (isLate(budget, dueDays, today)) return <span className="tag-late">Vencido</span>
  if (state === "partial") return <span className="tag-warn">Abonado</span>
  return <span className="tag-warn">Por cobrar</span>
}

/* ---------- Vacíos y cargas ---------- */

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 border-2 border-dashed border-ink/40 px-5 py-8">
      <p className="display-2 text-[18px]">{title}</p>
      {children && <div className="text-[14px] text-ink-2">{children}</div>}
    </div>
  )
}

export function Loading({ label = "Cargando" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-16 text-[15px] font-semibold text-ink-2" role="status">
      <span className="inline-block h-3 w-3 animate-pulse bg-red" />
      {label}…
    </div>
  )
}

/* ---------- Avisos ---------- */

/** busy = algo en curso (queda hasta que se cierre con dismiss) */
type Toast = { id: number; text: string; tone: "ok" | "warn" | "busy" }
type Push = (text: string, tone?: Toast["tone"], ms?: number) => number
const ToastCtx = createContext<{ push: Push; dismiss: (id: number) => void }>({ push: () => 0, dismiss: () => {} })
/** Muestra un aviso; devuelve su id. ms = 0 lo deja fijo hasta dismiss(id) */
export const useToast = () => useContext(ToastCtx).push
export const useDismissToast = () => useContext(ToastCtx).dismiss

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback<Push>(
    (text, tone = "ok", ms = 4200) => {
      const id = Date.now() + Math.random()
      setToasts((t) => [...t, { id, text, tone }])
      if (ms > 0) setTimeout(() => dismiss(id), ms)
      return id
    },
    [dismiss],
  )
  return (
    <ToastCtx.Provider value={{ push, dismiss }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-center gap-3 border-2 border-ink px-4 py-3 text-[14px] font-semibold shadow-hard",
              t.tone === "ok" && "bg-green-bg text-green",
              t.tone === "warn" && "bg-amber-bg text-amber",
              t.tone === "busy" && "bg-ink text-paper",
            )}
          >
            {t.tone === "busy" && <span className="inline-block h-3 w-3 shrink-0 animate-pulse bg-red" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
