"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useData } from "@/hooks/data"
import { BudgetEditor } from "@/components/budgets/editor"
import { Loading } from "@/components/ui/kit"

function NewBudget() {
  const params = useSearchParams()
  const { budgets } = useData()
  // ?desde=<id> duplica un presupuesto existente (mismos ítems, número y fecha nuevos)
  const source = budgets.find((b) => b.id === params.get("desde")) ?? undefined
  return <BudgetEditor key={source?.id ?? "new"} source={source} />
}

export default function NuevoPresupuestoPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewBudget />
    </Suspense>
  )
}
