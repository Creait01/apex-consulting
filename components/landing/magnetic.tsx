"use client"

import { useEffect, useRef, type ReactNode } from "react"

/* El botón se inclina apenas hacia el puntero cuando este se acerca, y vuelve
   a su lugar con un resorte. Solo con puntero fino y sin reduced-motion. */
export function Magnetic({ children, strength = 0.32 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    if (window.matchMedia("(pointer: coarse)").matches) return

    const move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      const dist = Math.hypot(dx, dy)
      const radius = Math.max(r.width * 0.9, 130)

      if (dist < radius) {
        const f = (1 - dist / radius) * strength
        el.style.transform = `translate(${dx * f}px, ${dy * f}px)`
      } else if (el.style.transform) {
        el.style.transform = ""
      }
    }

    window.addEventListener("mousemove", move, { passive: true })
    return () => window.removeEventListener("mousemove", move)
  }, [strength])

  return (
    <span ref={ref} className="lg-magnetic">
      {children}
    </span>
  )
}
