/* --------------------------------------------------------------------------
   El perfil del Ávila.

   Un solo perfil, compartido por el SVG del héroe y el canvas de tinta, para
   que la montaña dibujada y la montaña donde se asienta la tinta sean la
   misma. Leído de oeste a este: la Silla de Caracas como doble joroba hacia
   el centro y el Pico Naiguatá (2.765 m) como ápice a la derecha.
   -------------------------------------------------------------------------- */

export const N_CONTOURS = 10
export const VIEW_W = 1200
export const VIEW_H = 420
export const PEAK_X = 0.795
export const PEAK_M = 2765

/* [x, elevación] normalizados 0..1 */
const POINTS: Array<[number, number]> = [
  [0, 0.26],
  [0.06, 0.4],
  [0.12, 0.34],
  [0.2, 0.52],
  [0.27, 0.46],
  [0.34, 0.62],
  [0.4, 0.55],
  [0.47, 0.72],
  [0.52, 0.66],
  [0.585, 0.74],
  [0.64, 0.58],
  [0.72, 0.72],
  [PEAK_X, 1],
  [0.86, 0.62],
  [0.93, 0.4],
  [1, 0.28],
]

/** Elevación del perfil en x (0..1), interpolación lineal: cresta serrana. */
export function ridge(x: number): number {
  if (x <= 0) return POINTS[0][1]
  if (x >= 1) return POINTS[POINTS.length - 1][1]
  for (let i = 1; i < POINTS.length; i++) {
    const [x1, y1] = POINTS[i]
    if (x <= x1) {
      const [x0, y0] = POINTS[i - 1]
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
    }
  }
  return POINTS[POINTS.length - 1][1]
}

/* La montaña como curvas de nivel: la línea 0 es casi una regla contable
   plana; cada línea superior está más deformada por el perfil, y la última
   es la cresta completa. Las reglas del libro subiendo hasta volverse Ávila. */
const PAD_BOTTOM = 8
const STACK_GAP = 16
const AMPLITUDE = 220

/** y en unidades del viewBox (desde arriba) para la curva de nivel i en x. */
export function contourY(x: number, i: number, n: number = N_CONTOURS): number {
  return VIEW_H - PAD_BOTTOM - i * STACK_GAP - ridge(x) * AMPLITUDE * Math.pow(i / n, 1.15)
}

/** Path SVG de la curva de nivel i. */
export function contourPath(i: number, n: number = N_CONTOURS): string {
  const steps = 140
  let d = ""
  for (let s = 0; s <= steps; s++) {
    const x = s / steps
    const px = (x * VIEW_W).toFixed(1)
    const py = contourY(x, i, n).toFixed(1)
    d += s === 0 ? `M ${px} ${py}` : ` L ${px} ${py}`
  }
  return d
}
