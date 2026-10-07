"use client"

/** Abre el diálogo de impresión (y "Guardar como PDF") con el HTML de un reporte.
    Usa un iframe oculto: no lo bloquea el navegador como a las ventanas emergentes.
    El título del documento es el nombre que Chrome propone para el PDF. */
export function printHTML(html: string, title: string) {
  const iframe = document.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none"
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    iframe.remove()
    openHTML(html)
    return
  }

  let printed = false
  const go = async () => {
    if (printed) return
    printed = true
    try {
      await (doc as Document & { fonts?: FontFaceSet }).fonts?.ready
    } catch {}
    const previous = document.title
    document.title = title
    win.focus()
    win.print()
    setTimeout(() => {
      document.title = previous
      iframe.remove()
    }, 1000)
  }

  iframe.onload = () => setTimeout(go, 150)
  doc.open()
  doc.write(html)
  doc.close()
  // Si onload ya pasó (documento sin recursos pendientes)
  setTimeout(go, 2500)
}

/** Abre el reporte en una pestaña nueva para verlo antes de imprimir */
export function openHTML(html: string) {
  const w = window.open("", "_blank")
  if (!w) return false
  w.document.open()
  w.document.write(html.replace("<body>", `<body><div class="toolbar"><button class="p" onclick="window.print()">Imprimir / PDF</button><button onclick="window.close()">Cerrar</button></div>`))
  w.document.close()
  return true
}

/** Descarga un CSV (separado por punto y coma para Excel en español) */
export function downloadCSV(filename: string, rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = typeof v === "number" ? v.toFixed(2).replace(".", ",") : String(v ?? "")
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
