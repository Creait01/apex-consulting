"use client"

import { useEffect, useState } from "react"
import { CountUp } from "./count-up"
import { useOnceInView } from "./use-once-in-view"

/* --------------------------------------------------------------------------
   El flujo vivo.

   No una fila de tarjetas: el ciclo real del sistema operando frente al
   lector. Un presupuesto se aprueba, se factura, se cobra en dos pagos y el
   saldo cierra en cero. Los montos tabulan; los estados cambian en secuencia.

   Guion (un paso por pulso):
     1  presupuesto aprobado           $ 48.600
     2  factura emitida                $ 48.600
     3  primer pago registrado         $ 20.000
     4  el saldo queda a la vista      $ 28.600
     5  segundo pago; el saldo cuadra  $ 0
   -------------------------------------------------------------------------- */

const TOTAL = 48600
const PAGO_1 = 20000
const LAST_STEP = 5
const PULSE_MS = 1050

const money = (n: number) => `$ ${n.toLocaleString("es-AR")}`

function Node({
  label,
  amount,
  state,
  active,
  tone = "posted",
}: {
  label: string
  amount: number
  state: string
  active: boolean
  tone?: "posted" | "pending"
}) {
  return (
    <div className={`lg-flow-node ${active ? "is-on" : ""}`}>
      <p className="lg-mono text-[var(--ink-40)]">{label}</p>
      <p className="lg-num mt-2 text-2xl md:text-[1.65rem]">
        {active ? <CountUp to={amount} active format={money} /> : "—"}
      </p>
      <p className={`lg-mono mt-2 ${tone === "pending" ? "text-[var(--pending)]" : "text-[var(--posted)]"}`}>
        {active ? state : " "}
      </p>
    </div>
  )
}

function Connector({ active }: { active: boolean }) {
  return (
    <div className="lg-flow-line hidden md:block" aria-hidden="true">
      <span className={`lg-flow-line-fill ${active ? "is-on" : ""}`} />
    </div>
  )
}

export function FlowDiagram() {
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

  const saldo = step >= 5 ? 0 : TOTAL - PAGO_1
  const pagado = step >= 5 ? TOTAL : PAGO_1

  return (
    <div ref={ref}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-[1fr_2.5rem_1fr_2.5rem_1fr_2.5rem_1fr] md:gap-x-0">
        <Node label="Presupuesto" amount={TOTAL} state="aprobado" active={step >= 1} />
        <Connector active={step >= 2} />
        <Node label="Factura" amount={TOTAL} state="emitida" active={step >= 2} />
        <Connector active={step >= 3} />
        <Node
          label="Pagos"
          amount={pagado}
          state={step >= 5 ? "2 de 2 registrados" : "1 de 2 registrados"}
          active={step >= 3}
        />
        <Connector active={step >= 4} />
        <Node
          label="Saldo"
          amount={saldo}
          state={step >= 5 ? "cuadra — al día" : "pendiente de cobro"}
          tone={step >= 5 ? "posted" : "pending"}
          active={step >= 4}
        />
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <p className="lg-mono text-[var(--ink-40)]">Montos de ejemplo · así registra el sistema un cobro en dos pagos</p>
        <button
          type="button"
          onClick={() => setRun((r) => r + 1)}
          className={`lg-mono lg-link text-[var(--ink-60)] transition-opacity duration-500 ${
            step >= LAST_STEP ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          Repetir el ciclo
        </button>
      </div>
    </div>
  )
}
