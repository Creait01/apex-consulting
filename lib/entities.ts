/* Clientes y proyectos se escriben a mano en cada presupuesto, así que el mismo
   cliente aparece como "A2 CORPORACION C.A", "A2 CORPORACION, C.A" o con un
   tabulador al final. Antes cada variante contaba como un cliente distinto y
   partía su deuda en dos. Aquí se agrupan por una clave normalizada sin tocar
   lo que está guardado. */

const LEGAL = /\b(C ?A|S ?A|S ?R ?L|L ?L ?C|INC|CORP)\b/g

export function entityKey(name: string | null | undefined): string {
  const key = String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(LEGAL, " ")
    .replace(/\s+/g, " ")
    .trim()
  return key || "SIN NOMBRE"
}

/** Clave → segmento de URL */
export const entitySlug = (key: string) => encodeURIComponent(key.toLowerCase().replace(/ /g, "-"))
export const slugKey = (slug: string) => decodeURIComponent(slug).replace(/-/g, " ").toUpperCase()

export interface Entity {
  key: string
  /** La forma más usada del nombre, limpia de espacios */
  name: string
  variants: string[]
}

/** Agrupa nombres por clave y elige como nombre la variante más frecuente */
export function groupNames(names: string[]): Map<string, Entity> {
  const counts = new Map<string, Map<string, number>>()
  for (const raw of names) {
    const clean = String(raw ?? "").replace(/\s+/g, " ").trim()
    const key = entityKey(clean)
    const variants = counts.get(key) ?? new Map<string, number>()
    variants.set(clean, (variants.get(clean) ?? 0) + 1)
    counts.set(key, variants)
  }
  const out = new Map<string, Entity>()
  counts.forEach((variants, key) => {
    const sorted = Array.from(variants.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    out.set(key, { key, name: sorted[0]?.[0] || key, variants: sorted.map(([v]) => v) })
  })
  return out
}
