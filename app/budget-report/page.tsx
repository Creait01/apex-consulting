import { redirect } from "next/navigation"

// Ruta anterior del editor de presupuestos; se conserva para enlaces guardados.
export default function LegacyBudgetReport() {
  redirect("/presupuestos/nuevo")
}
