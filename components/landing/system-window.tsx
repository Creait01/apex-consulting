"use client"

import { useEffect, useState } from "react"
import { useOnceInView } from "./use-once-in-view"

/* --------------------------------------------------------------------------
   Una ventana del sistema, operándose sola.

   Recreación del control de horas del panel real: las cargas de trabajo se
   asientan una por una y la barra de consumo avanza contra lo cotizado.
   Datos de ejemplo, mecánica idéntica a la del producto.
   -------------------------------------------------------------------------- */

const QUOTED = 40
const ROWS = [
  { date: "03/08", desc: "Módulo de turnos — API", hours: 8.5 },
  { date: "05/08", desc: "Pantalla de agenda", hours: 6 },
  { date: "11/08", desc: "Reportes en PDF", hours: 12.5 },
]
const LAST_STEP = ROWS.length
const PULSE_MS = 900

const hrs = (n: number) => `${n.toLocaleString("es-AR", { minimumFractionDigits: 1 })} h`

export function SystemWindow() {
  const { ref, inView } = useOnceInView<HTMLDivElement>(0.35)
  const [step, setStep] = useState(0)
  const [run, setRun] = useState(0)

  useEffect(() => {
    if (!inView) return

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(LAST_STEP)
      return
    }

    setStep(0)
    const id = window.setInterval(() => {
      setStep((s) => {
        if (s >= LAST_STEP) {
          window.clearInterval(id)
          return s
        }
        return s + 1
      })
    }, PULSE_MS)
    return () => window.clearInterval(id)
  }, [inView, run])

  const consumed = ROWS.slice(0, step).reduce((acc, r) => acc + r.hours, 0)

  return (
    <div ref={ref} className="lg-window">
      <div className="lg-window-head flex items-baseline justify-between gap-4 px-5 py-3">
        <span className="lg-mono">Control de horas</span>
        <span className="lg-mono text-[var(--ink-40)]">Proyecto de ejemplo</span>
      </div>

      <div className="px-5 pb-5">
        <div className="flex items-baseline justify-between gap-4 py-4">
          <span className="lg-mono text-[var(--ink-40)]">Cotizadas</span>
          <span className="lg-num text-sm">{hrs(QUOTED)}</span>
        </div>

        <div>
          {ROWS.map((row, i) => (
            <div
              key={row.date}
              className={`lg-fade-item flex items-baseline gap-4 border-t border-[var(--rule)] py-3 ${
                step >= i + 1 ? "is-on" : ""
              }`}
            >
              <span className="lg-mono shrink-0 text-[var(--ink-40)]">{row.date}</span>
              <span className="min-w-0 flex-1 truncate text-[0.95rem] text-[var(--ink-60)]">{row.desc}</span>
              <span className="lg-num shrink-0 text-sm">{hrs(row.hours)}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-[var(--ink)] pt-4">
          <span className="lg-hours-bar">
            <span className="lg-hours-fill" style={{ width: `${(consumed / QUOTED) * 100}%` }} />
          </span>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
            <span className="lg-mono text-[var(--ink-40)]">
              Consumidas <span className="text-[var(--ink)]">{hrs(consumed)}</span>
            </span>
            <span className="lg-mono text-[var(--posted)]">Restan {hrs(QUOTED - consumed)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setRun((r) => r + 1)}
          className={`lg-mono lg-link mt-5 text-[var(--ink-60)] transition-opacity duration-500 ${
            step >= LAST_STEP ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          Repetir
        </button>
      </div>
    </div>
  )
}
