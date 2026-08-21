"use client"

import { useEffect, useMemo, useRef } from "react"
import { contourPath, contourY, N_CONTOURS, PEAK_M, PEAK_X, VIEW_H, VIEW_W } from "./avila"

/* --------------------------------------------------------------------------
   El espectáculo del héroe.

   Las reglas del libro contable se curvan hasta volverse las curvas de nivel
   del Ávila. Al abrir la página, cada línea se traza de oeste a este; en la
   cumbre del Naiguatá, una marca: 2.765 m. El paralaje del puntero mueve la
   cordillera apenas, como una lámina detrás del papel.
   -------------------------------------------------------------------------- */

export function AvilaRidge() {
  const svgRef = useRef<SVGSVGElement>(null)
  const backRef = useRef<SVGGElement>(null)
  const frontRef = useRef<SVGGElement>(null)

  const contours = useMemo(
    () => Array.from({ length: N_CONTOURS + 1 }, (_, i) => ({ i, d: contourPath(i) })),
    [],
  )

  const peakY = contourY(PEAK_X, N_CONTOURS)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    if (window.matchMedia("(pointer: coarse)").matches) return

    const move = (e: MouseEvent) => {
      const nx = e.clientX / window.innerWidth - 0.5
      const ny = e.clientY / window.innerHeight - 0.5
      if (backRef.current) backRef.current.style.transform = `translate(${nx * -6}px, ${ny * -3}px)`
      if (frontRef.current) frontRef.current.style.transform = `translate(${nx * -12}px, ${ny * -6}px)`
    }

    window.addEventListener("mousemove", move, { passive: true })
    return () => window.removeEventListener("mousemove", move)
  }, [])

  return (
    <svg
      ref={svgRef}
      className="lg-ridge"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g ref={backRef} className="lg-ridge-layer">
        {contours.slice(0, N_CONTOURS - 2).map(({ i, d }) => (
          <path
            key={i}
            d={d}
            pathLength={1}
            className={i < 4 ? "lg-c-low" : "lg-c-mid"}
            style={{ transitionDelay: `${200 + i * 90}ms` }}
          />
        ))}
      </g>

      <g ref={frontRef} className="lg-ridge-layer">
        {contours.slice(N_CONTOURS - 2).map(({ i, d }) => (
          <path
            key={i}
            d={d}
            pathLength={1}
            className={i === N_CONTOURS ? "lg-c-ridge" : "lg-c-high"}
            style={{ transitionDelay: `${200 + i * 90}ms` }}
          />
        ))}

        {/* La cumbre: el ápice que da nombre a la empresa */}
        <g className="lg-ridge-peak">
          <circle cx={PEAK_X * VIEW_W} cy={peakY} r={3} />
          <text x={PEAK_X * VIEW_W + 10} y={peakY - 8} className="lg-ridge-label">
            Naiguatá · {PEAK_M.toLocaleString("es-AR")} m
          </text>
        </g>
      </g>
    </svg>
  )
}
