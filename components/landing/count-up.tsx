"use client"

import { useEffect, useRef, useState } from "react"

/* Tabula un número hasta su objetivo, como una calculadora de escritorio.
   Si el objetivo cambia, arranca desde el valor mostrado, no desde cero. */
export function CountUp({
  to,
  active = true,
  duration = 800,
  format = (n: number) => String(n),
}: {
  to: number
  active?: boolean
  duration?: number
  format?: (n: number) => string
}) {
  const [display, setDisplay] = useState(0)
  const displayRef = useRef(0)

  useEffect(() => {
    if (!active) return

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      displayRef.current = to
      setDisplay(to)
      return
    }

    const from = displayRef.current
    const delta = to - from
    if (delta === 0) return

    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min((t - t0) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      const v = Math.round(from + delta * eased)
      displayRef.current = v
      setDisplay(v)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, active, duration])

  return <>{format(display)}</>
}
