/* --------------------------------------------------------------------------
   Aritmética de presupuestos — fuente única de verdad.

   El total de un presupuesto se muestra en cuatro lugares (editor, dashboard,
   estado de cuenta y los PDF). Si cada uno lo calculara por su cuenta, un
   descuento aplicado en uno y olvidado en otro haría que el cliente reciba un
   PDF con un monto distinto al del sistema. Todos deben llamar acá.

   Los ítems se guardan en la columna `items` (JSONB), así que los campos de
   descuento son opcionales: un presupuesto viejo sin ellos vale descuento 0.
   -------------------------------------------------------------------------- */

export type DiscountType = "percent" | "amount"

export interface BudgetItemLike {
  quantity: number | string
  rate: number | string
  discount_type?: DiscountType
  discount_value?: number | string
}

const num = (v: number | string | undefined | null) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Importe del ítem antes de descuento. */
export function itemGross(item: BudgetItemLike): number {
  return num(item.quantity) * num(item.rate)
}

/** Descuento del ítem en dinero. Nunca negativo ni mayor que el bruto. */
export function itemDiscount(item: BudgetItemLike): number {
  const gross = itemGross(item)
  if (gross <= 0) return 0

  const value = num(item.discount_value)
  if (value <= 0) return 0

  const raw = item.discount_type === "amount" ? value : (gross * Math.min(value, 100)) / 100
  return Math.min(raw, gross)
}

/** Importe final del ítem, ya descontado. */
export function itemNet(item: BudgetItemLike): number {
  return itemGross(item) - itemDiscount(item)
}

/** Porcentaje de descuento del ítem, derivado del monto. Para mostrar. */
export function itemDiscountPercent(item: BudgetItemLike): number {
  const gross = itemGross(item)
  if (gross <= 0) return 0
  return (itemDiscount(item) / gross) * 100
}

/** Suma de los ítems antes de descuentos. */
export function budgetSubtotal(items: BudgetItemLike[] = []): number {
  return items.reduce((sum, item) => sum + itemGross(item), 0)
}

/** Suma de los descuentos de todos los ítems. */
export function budgetDiscount(items: BudgetItemLike[] = []): number {
  return items.reduce((sum, item) => sum + itemDiscount(item), 0)
}

/** Total a cobrar: subtotal menos descuentos. Es el valor que se guarda. */
export function budgetTotal(items: BudgetItemLike[] = []): number {
  return items.reduce((sum, item) => sum + itemNet(item), 0)
}

/** ¿Algún ítem tiene descuento? Decide si el PDF muestra las filas extra. */
export function hasAnyDiscount(items: BudgetItemLike[] = []): boolean {
  return items.some((item) => itemDiscount(item) > 0)
}

/** Formato de moneda del sistema, con dos decimales. */
export function money(n: number): string {
  return Number(n).toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
