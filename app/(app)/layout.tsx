"use client"

import type React from "react"
import { DataProvider, useData } from "@/hooks/data"
import { RateProvider } from "@/hooks/rate"
import { Shell } from "@/components/shell/shell"
import { Loading, ToastProvider } from "@/components/ui/kit"
import { PaymentDialogProvider } from "@/components/payments/payment-dialog"

function Gate({ children }: { children: React.ReactNode }) {
  const { loaded, error, reload } = useData()
  if (error) {
    return (
      <div className="max-w-xl border-2 border-ink bg-amber-bg p-5 shadow-hard">
        <p className="display-2 text-[20px] text-amber">No se pudieron cargar los datos</p>
        <p className="mt-2 text-[14px] text-ink-2">{error}</p>
        <button className="btn-ink mt-4" onClick={reload}>
          Reintentar
        </button>
      </div>
    )
  }
  // Solo la primera carga bloquea; las recargas posteriores no parpadean
  if (!loaded) return <Loading label="Cargando presupuestos y cobros" />
  return <>{children}</>
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider>
      <RateProvider>
        <ToastProvider>
          <PaymentDialogProvider>
            <Shell>
              <Gate>{children}</Gate>
            </Shell>
          </PaymentDialogProvider>
        </ToastProvider>
      </RateProvider>
    </DataProvider>
  )
}
