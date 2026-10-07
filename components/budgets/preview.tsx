"use client"

import { useEffect, useRef, useState } from "react"

/** Muestra un reporte HTML escalado al ancho disponible (la misma hoja que se imprime) */
export function DocPreview({ html, title = "Vista previa" }: { html: string; title?: string }) {
  const wrap = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [scale, setScale] = useState(0.6)
  const [height, setHeight] = useState(1200)
  const [doc, setDoc] = useState(html)

  // Evita recargar el iframe en cada tecla
  useEffect(() => {
    const id = setTimeout(() => setDoc(html), 220)
    return () => clearTimeout(id)
  }, [html])

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setScale(Math.min(entry.contentRect.width / 900, 1)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const measure = () => {
    // El borde inferior real de la hoja (scrollHeight nunca baja de la altura del iframe)
    const sheet = frame.current?.contentDocument?.querySelector(".sheet")
    if (sheet) setHeight(Math.ceil(sheet.getBoundingClientRect().bottom) + 24)
  }

  return (
    <div ref={wrap} className="w-full">
      <div className="mx-auto overflow-hidden" style={{ height: height * scale, width: 900 * scale }}>
      <iframe
        ref={frame}
        title={title}
        srcDoc={doc}
        onLoad={() => {
          measure()
          // Las fuentes cambian la altura al terminar de cargar
          frame.current?.contentDocument?.fonts?.ready.then(measure).catch(() => {})
          setTimeout(measure, 900)
        }}
        className="origin-top-left border-0 bg-transparent"
        style={{ width: 900, height, transform: `scale(${scale})` }}
      />
      </div>
    </div>
  )
}
