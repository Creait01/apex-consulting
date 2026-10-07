/* Logotipo de Apex según el manual §2: la cresta del Ávila en una sola línea y
   el marcador rojo en el pico. El rojo es el único color del logo. */

export const RIDGE_PATH =
  "M8 176 L120 140 L190 112 L228 84 L242 94 L252 78 L268 96 L290 64 L318 86 L390 132 L470 164 L512 176"
export const MARKER_PATH = "M290 50 L284 60 L296 60 Z"
/** Recorte del viewBox base (0 0 520 200) al contorno de la marca */
export const MARK_VIEWBOX = "0 44 520 140"
export const RIDGE_LENGTH = 600

export const BRAND = {
  night: "#070B17",
  night2: "#121833",
  red: "#E8380D",
  redDeep: "#B8300F",
  paper: "#F6F1E8",
  ink: "#0E1422",
  ink2: "#4A5263",
  mute: "#8A8F9C",
  amberBg: "#FDF1D8",
  amber: "#B45309",
  greenBg: "#DCF5E4",
  green: "#15803D",
} as const

/** En tamaños chicos el marcador se agranda (manual: perfil 2,4×) y se apoya sobre el trazo sin encimarse */
export const markerTransform = (stroke: number, scale: number) =>
  `translate(290 ${(60 - stroke / 2 + 2).toFixed(2)}) scale(${scale}) translate(-290 -60)`

/** SVG de la marca sola, para incrustar en reportes HTML */
export function markSVG({ color = BRAND.ink as string, stroke = 9, width = 120 }: { color?: string; stroke?: number; width?: number } = {}) {
  return `<svg viewBox="${MARK_VIEWBOX}" width="${width}" height="${Math.round((width * 140) / 520)}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="${RIDGE_PATH}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/><path d="${MARKER_PATH}" fill="${BRAND.red}" transform="${markerTransform(stroke, 2.4)}"/></svg>`
}

/** Logo horizontal (marca + APEX / CONSULTING) en HTML para reportes */
export function logoHTML({ color = BRAND.ink as string, size = 30 }: { color?: string; size?: number } = {}) {
  return `<div class="logo" style="display:flex;align-items:center;gap:${Math.round(size * 0.55)}px;color:${color}">
    ${markSVG({ color, width: Math.round(size * 3.1) })}
    <div style="display:flex;flex-direction:column;line-height:1">
      <span style="font-stretch:125%;font-weight:850;letter-spacing:.01em;font-size:${size}px">APEX</span>
      <span style="font-stretch:100%;font-weight:500;letter-spacing:.44em;font-size:${Math.round(size * 0.36)}px;opacity:.72;margin-top:${Math.round(size * 0.18)}px">CONSULTING</span>
    </div>
  </div>`
}
