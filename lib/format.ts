/* Formatos venezolanos (manual §5): "Bs. 12.480,00", "$ 1.580,00", fechas dd/mm/aaaa.

   Las fechas de la base vienen como "AAAA-MM-DD". `new Date("2026-09-25")` las
   interpreta en UTC, y en Caracas (UTC−4) eso es el 24 a las 8 p. m.: por eso
   antes se mostraban con un día menos. Aquí siempre se leen como fecha local. */

const nf2 = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nf0 = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 })

export const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

export const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Lee un monto escrito a mano: "1.376.762,86", "1376762,86", "120.50" o "120" */
export function parseAmount(text: string): number {
  const s = String(text ?? "").replace(/[^\d.,-]/g, "")
  if (!s) return 0
  const lastComma = s.lastIndexOf(",")
  const lastDot = s.lastIndexOf(".")
  let normalized: string
  if (lastComma >= 0 && lastDot >= 0) {
    // El separador que aparece de último es el decimal
    normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "")
  } else if (lastComma >= 0) {
    normalized = s.replace(/\./g, "").replace(/,(?=.*,)/g, "").replace(",", ".")
  } else if (lastDot >= 0 && (s.match(/\./g)?.length ?? 0) === 1 && s.length - lastDot - 1 !== 3) {
    normalized = s // "120.50" o "871.3689": punto decimal ("1.500" se lee como miles)
  } else {
    normalized = s.replace(/\./g, "") // "1.376.762": puntos de miles
  }
  return num(normalized)
}

/** Número → texto editable con coma decimal: 104564.4 → "104564,40" */
export const toInput = (n: number) => (Number.isFinite(n) && n !== 0 ? round2(n).toFixed(2).replace(".", ",") : "")

/** 1.580,00 */
export const amount = (n: number) => nf2.format(num(n))

/** Cantidades y porcentajes sin ceros de más: 3 · 2,5 · 12,75 */
export const plain = (n: number) => num(n).toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** $ 1.580,00 */
export const usd = (n: number) => `$ ${nf2.format(num(n))}`

/** Bs. 1.376.762,86 */
export const ves = (n: number) => `Bs. ${nf2.format(num(n))}`

/** Cifras grandes sin decimales para gráficos: $ 12.480 */
export const usdShort = (n: number) => `$ ${nf0.format(num(n))}`

export const pct = (n: number, digits = 0) =>
  `${num(n).toLocaleString("es-VE", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`

/** Tasa BCV con 2 decimales: 871,37 */
export const rateFmt = (n: number) => nf2.format(num(n))

/* ---------- Fechas ---------- */

/** Lunes, 5 de octubre de 2026 */
export function dayLong(day: string | null | undefined): string {
  const d = parseDay(day)
  if (Number.isNaN(d.getTime())) return "—"
  const s = d.toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "AAAA-MM-DD" → Date local a medianoche */
export function parseDay(day: string | null | undefined): Date {
  if (!day) return new Date(NaN)
  const [y, m, d] = day.slice(0, 10).split("-").map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** Date → "AAAA-MM-DD" en hora local */
export function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export const today = () => dayKey(new Date())

export function addDays(day: string, n: number): string {
  const d = parseDay(day)
  d.setDate(d.getDate() + n)
  return dayKey(d)
}

/** Días completos entre dos fechas "AAAA-MM-DD" (b − a) */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000)
}

/** 25/09/2026 */
export function dateFmt(day: string | null | undefined): string {
  const d = parseDay(day)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" })
}

/** 25 sep 2026 */
export function dateShort(day: string | null | undefined): string {
  const d = parseDay(day)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric" }).replace(".", "")
}

/** 5 de octubre de 2026 */
export function dateLong(day: string | null | undefined): string {
  const d = parseDay(day)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" })
}

/** "2026-09" */
export const monthKey = (day: string) => day.slice(0, 7)

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
const MONTHS_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]

/** "2026-09" → "sep 26" */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`
}

/** "2026-09" → "septiembre 2026" */
export function monthLong(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return `${MONTHS_LONG[m - 1]} ${y}`
}

/** Las últimas `n` claves de mes terminando en el mes de `day` */
export function lastMonths(n: number, day = today()): string[] {
  const d = parseDay(day)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`)
  }
  return out
}

export const plural = (n: number, one: string, many: string) => `${nf0.format(n)} ${n === 1 ? one : many}`

/** Escapa texto del usuario antes de meterlo en el HTML de un reporte */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
