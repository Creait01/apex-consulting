"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LogOut, Menu, Plus, X } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { Triangle } from "@/components/ui/kit"
import { useAuth } from "@/hooks/useAuth"
import { useData } from "@/hooks/data"
import { useRate } from "@/hooks/rate"
import { cn } from "@/lib/utils"
import { dateFmt, rateFmt, today } from "@/lib/format"
import { isLate, isOpen } from "@/lib/metrics"

const NAV = [
  { href: "/dashboard", label: "Resumen" },
  { href: "/presupuestos", label: "Presupuestos" },
  { href: "/cobros", label: "Cobros" },
  { href: "/clientes", label: "Clientes" },
  { href: "/ajustes", label: "Ajustes" },
]

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading: authLoading, signOut } = useAuth()
  const { budgets, settings, profile } = useData()
  const { rate, rateDate } = useRate()
  const [open, setOpen] = useState(false)

  // Si la sesión se cierra en otra pestaña o vence, volver al login
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login")
  }, [authLoading, user, router])

  useEffect(() => setOpen(false), [pathname])

  const counts = useMemo(() => {
    const t = today()
    const open = budgets.filter(isOpen)
    return {
      "/presupuestos": open.length,
      "/cobros": open.filter((b) => isLate(b, settings.due_days, t)).length,
    } as Record<string, number>
  }, [budgets, settings.due_days])

  const name = profile?.full_name || user?.email || ""

  const handleSignOut = async () => {
    await signOut()
    router.replace("/login")
  }

  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Secciones">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/")
        const count = counts[item.href]
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-11 items-center gap-3 border-2 px-3 text-[15px] font-semibold transition-colors",
              active
                ? "border-snow bg-paper text-ink shadow-[4px_4px_0_0_#E8380D]"
                : "border-transparent text-snow-2 hover:border-snow/40 hover:text-snow",
            )}
            style={{ fontStretch: "110%" }}
          >
            <span className="flex w-3 justify-center">{active && <Triangle />}</span>
            <span className="flex-1">{item.label}</span>
            {count > 0 && (
              <span
                className={cn(
                  "num min-w-[24px] border px-1 text-center text-[12px] leading-5",
                  active ? "border-ink" : "border-snow/40",
                  item.href === "/cobros" && !active && "border-amber bg-amber text-white",
                )}
              >
                {count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )

  const footer = (
    <div className="flex flex-col gap-3">
      <div className="border-2 border-snow/25 px-3 py-2.5">
        <div className="text-[12px] font-semibold text-snow-mute">Tasa BCV {rateDate ? `· ${dateFmt(rateDate)}` : ""}</div>
        <div className="display mt-1 text-[22px] text-snow">
          {rate ? rateFmt(rate) : "—"} <span className="text-[13px] font-semibold text-snow-mute" style={{ fontStretch: "100%" }}>Bs/$</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-snow/15 pt-3">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold text-snow">{name}</div>
          <div className="truncate text-[12px] text-snow-mute">{settings.company_name || "Apex Consulting"}</div>
        </div>
        <button onClick={handleSignOut} className="btn btn-sm shrink-0 border-snow/40 text-snow hover:border-snow" title="Cerrar sesión">
          <LogOut className="h-4 w-4" />
          <span className="sr-only">Cerrar sesión</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen lg:pl-[264px]">
      {/* Lateral fijo en escritorio */}
      <aside className="bg-noche fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r-2 border-ink px-5 py-6 lg:flex">
        <Link href="/dashboard" aria-label="Inicio" className="mb-7 block">
          <Logo tone="snow" draw />
        </Link>
        <Link href="/presupuestos/nuevo" className="btn-red mb-6 w-full border-snow shadow-[3px_3px_0_0_#F3F5FB]">
          <Plus className="h-4 w-4" strokeWidth={3} />
          Nuevo presupuesto
        </Link>
        {nav}
        <div className="mt-auto pt-6">{footer}</div>
      </aside>

      {/* Barra superior en móvil */}
      <div className="bg-noche sticky top-0 z-40 flex h-16 items-center justify-between border-b-2 border-ink px-4 lg:hidden">
        <Link href="/dashboard" aria-label="Inicio">
          <Logo tone="snow" full={false} />
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/presupuestos/nuevo" className="btn-red btn-sm border-snow" aria-label="Nuevo presupuesto">
            <Plus className="h-4 w-4" strokeWidth={3} />
          </Link>
          <button onClick={() => setOpen(true)} className="btn btn-sm border-snow/50 text-snow" aria-label="Abrir menú">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-night/70" onClick={() => setOpen(false)} aria-label="Cerrar menú" />
          <div className="bg-noche absolute inset-y-0 right-0 flex w-[min(86vw,320px)] flex-col border-l-2 border-ink px-5 py-5">
            <div className="mb-6 flex items-center justify-between">
              <Logo tone="snow" />
              <button onClick={() => setOpen(false)} className="btn btn-sm border-snow/50 text-snow" aria-label="Cerrar menú">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            <div className="mt-auto pt-6">{footer}</div>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1480px] px-4 py-7 sm:px-6 lg:px-10 lg:py-9">{children}</main>
    </div>
  )
}
