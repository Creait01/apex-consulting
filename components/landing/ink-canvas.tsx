"use client"

import { useEffect, useRef, useState } from "react"
import { contourY, N_CONTOURS, VIEW_H } from "./avila"

/* --------------------------------------------------------------------------
   La firma de la experiencia.

   Fragmentos de tinta — cifras, referencias, restos de planilla — flotan en
   desorden sobre el papel. A medida que el lector baja, el scroll los asienta
   sobre las curvas de nivel del Ávila: los números cuadran y forman la
   montaña. Subir vuelve a soltarlos.

   Canvas 2D puro. Sin librerías, sin assets. Los glifos se pre-renderizan a
   sprites una sola vez; el bucle de dibujo solo compone imágenes.
   -------------------------------------------------------------------------- */

const GLYPHS = [
  "0", "1", "2", "3", "4", "5", "7", "8", "9",
  "$", "%", "H", "N°",
  "REF", "PRE", "FAC",
  "12,5", "48.600", "27,0", "0,00", "60%",
  "—", "···",
]

const INK = "#1a1d1a"
const GREY = "#878d86"
const GREEN = "#2f6b4f"

interface Particle {
  sprite: HTMLCanvasElement
  /* posición de origen del caos y parámetros de deriva */
  cx: number
  cy: number
  amp: number
  freq: number
  phase: number
  rot: number
  /* casilla que le corresponde en la retícula */
  hx: number
  hy: number
  /* retardo del asentamiento, para que no caigan todos juntos */
  delay: number
  baseAlpha: number
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function damp(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}

function makeSprite(glyph: string, color: string, size: number, dpr: number) {
  const font = `500 ${size}px "Martian Mono", ui-monospace, Menlo, monospace`
  const measure = document.createElement("canvas").getContext("2d")!
  measure.font = font
  const w = Math.ceil(measure.measureText(glyph).width) + 4
  const h = Math.ceil(size * 1.5)

  const c = document.createElement("canvas")
  c.width = Math.max(1, Math.round(w * dpr))
  c.height = Math.max(1, Math.round(h * dpr))
  const g = c.getContext("2d")!
  g.scale(dpr, dpr)
  g.font = font
  g.fillStyle = color
  g.textBaseline = "middle"
  g.fillText(glyph, 2, h / 2)
  return c
}

export function InkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [enabled, setEnabled] = useState(false)

  // Mejora progresiva: solo escritorio y solo si el visitante acepta movimiento.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    const decide = () => setEnabled(!reduced.matches && window.innerWidth >= 768)
    decide()
    reduced.addEventListener("change", decide)
    return () => reduced.removeEventListener("change", decide)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0
    let H = 0
    let particles: Particle[] = []
    let raf = 0
    let last = performance.now()

    /* Avance del asentamiento, suavizado: la inercia vive acá */
    let G = 0
    const pointer = { x: -9999, y: -9999 }

    const spriteCache = new Map<string, HTMLCanvasElement>()
    const sprite = (glyph: string, color: string, size: number) => {
      const key = `${glyph}|${color}|${size}`
      let s = spriteCache.get(key)
      if (!s) {
        s = makeSprite(glyph, color, size, dpr)
        spriteCache.set(key, s)
      }
      return s
    }

    const build = () => {
      const rect = canvas.parentElement!.getBoundingClientRect()
      W = Math.round(rect.width)
      H = Math.round(rect.height)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const count = Math.round(Math.min(170, Math.max(80, (W * H) / 14000)))

      /* Donde todo se asienta: las curvas de nivel del Ávila, en el mismo
         espacio que ocupa el SVG de la cordillera al pie del héroe */
      const svgH = Math.min(window.innerHeight * 0.46, 420)
      const scaleY = svgH / VIEW_H
      const yTop = H - svgH

      particles = []
      for (let i = 0; i < count; i++) {
        const roll = Math.random()
        const color = roll < 0.52 ? INK : roll < 0.9 ? GREY : GREEN
        const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
        const size = glyph.length > 2 ? 10 + Math.random() * 2 : 11 + Math.random() * 4

        const xn = 0.02 + Math.random() * 0.96
        const line = 2 + Math.floor(Math.random() * (N_CONTOURS - 1))
        particles.push({
          sprite: sprite(glyph, color, Math.round(size)),
          cx: Math.random() * W,
          cy: Math.random() * H * 0.92,
          amp: 18 + Math.random() * 30,
          freq: 0.25 + Math.random() * 0.5,
          phase: Math.random() * Math.PI * 2,
          rot: (Math.random() - 0.5) * 1.1,
          hx: xn * W,
          hy: yTop + contourY(xn, line) * scaleY + (Math.random() - 0.5) * 5,
          delay: Math.random() * 0.4,
          baseAlpha: color === GREEN ? 0.55 : 0.42 + Math.random() * 0.16,
        })
      }
    }

    const onPointer = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = e.clientX - rect.left
      pointer.y = e.clientY - rect.top
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now

      /* El scroll dicta el objetivo; G lo persigue con retardo físico */
      const vh = window.innerHeight
      const target = Math.min(1, Math.max(0, window.scrollY / (vh * 0.85)))
      G = damp(G, target, 4.2, dt)

      /* Fuera del héroe y ya asentado: no dibujar nada */
      if (window.scrollY > H * 1.25 && Math.abs(G - target) < 0.001) return

      const t = now / 1000
      ctx.clearRect(0, 0, W, H)

      for (const p of particles) {
        const local = Math.min(1, Math.max(0, G * 1.45 - p.delay * 0.45))
        const e = easeInOutCubic(local)

        /* deriva del caos, que se apaga al asentarse */
        const driftX = p.cx + Math.sin(t * p.freq + p.phase) * p.amp * (1 - e)
        const driftY = p.cy + Math.cos(t * p.freq * 0.8 + p.phase) * p.amp * 0.7 * (1 - e)

        let x = driftX + (p.hx - driftX) * e
        let y = driftY + (p.hy - driftY) * e

        /* el puntero aparta la tinta suelta, nunca la asentada */
        const pdx = x - pointer.x
        const pdy = y - pointer.y
        const dist = Math.hypot(pdx, pdy)
        if (dist < 110 && dist > 0.01) {
          const push = ((1 - dist / 110) * 24 * (1 - e)) / dist
          x += pdx * push
          y += pdy * push
        }

        const alpha = p.baseAlpha * (1 - e) + 0.11 * e
        if (alpha < 0.01) continue

        ctx.globalAlpha = alpha
        ctx.translate(x, y)
        ctx.rotate(p.rot * (1 - e))
        ctx.drawImage(p.sprite, 0, 0, p.sprite.width / dpr, p.sprite.height / dpr)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      ctx.globalAlpha = 1
    }

    build()
    window.addEventListener("resize", build)
    window.addEventListener("mousemove", onPointer, { passive: true })
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", build)
      window.removeEventListener("mousemove", onPointer)
    }
  }, [enabled])

  if (!enabled) return null
  return <canvas ref={canvasRef} className="lg-ink" aria-hidden="true" />
}
