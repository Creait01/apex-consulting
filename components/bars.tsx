"use client"

import { usd } from "@/lib/format"
import { cn } from "@/lib/utils"

const INK = "#0E1422"

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[13px] text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-2">
          <i className="inline-block h-3 w-3 border border-ink" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

/** Barra apilada horizontal (antigüedad de saldos) */
export function StackBar({ parts, className }: { parts: { value: number; color: string; label: string }[]; className?: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  return (
    <div className={cn("flex h-6 w-full border-2 border-ink bg-paper", className)} role="img" aria-label="Distribución">
      {total > 0 &&
        parts
          .filter((p) => p.value > 0)
          .map((p, i) => (
            <span
              key={p.label}
              title={`${p.label}: ${usd(p.value)}`}
              className={cn("h-full", i > 0 && "border-l-2 border-ink")}
              style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
            />
          ))}
    </div>
  )
}

/** Lista con barras proporcionales (proyectos, clientes, métodos) */
export function BarList({
  rows,
  format = usd,
  color = INK,
}: {
  rows: { label: string; value: number; sub?: string }[]
  format?: (n: number) => string
  color?: string
}) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13.5px]">
            <span className="truncate font-semibold">{r.label}</span>
            <span className="num shrink-0 font-semibold">{format(r.value)}</span>
          </div>
          <div className="h-2.5 w-full bg-paper">
            <div className="h-full" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </div>
          {r.sub && <div className="mt-0.5 text-[12px] text-ink-2">{r.sub}</div>}
        </li>
      ))}
    </ul>
  )
}
