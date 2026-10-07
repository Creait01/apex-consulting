"use client"

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { monthLabel, monthLong, usd, usdShort } from "@/lib/format"
import type { MonthRow } from "@/lib/metrics"

const INK = "#0E1422"
const RED = "#E8380D"

function MonthTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as MonthRow
  return (
    <div className="border-2 border-ink bg-white px-3 py-2.5 text-[13px] shadow-hard-sm">
      <div className="mb-1.5 font-bold capitalize">{monthLong(label)}</div>
      <div className="flex items-center justify-between gap-6">
        <span className="flex items-center gap-2 text-ink-2">
          <i className="inline-block h-2.5 w-2.5 bg-ink" />
          Presupuestado
        </span>
        <b className="num">{usd(row.budgeted)}</b>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="flex items-center gap-2 text-ink-2">
          <i className="inline-block h-2.5 w-2.5 bg-red" />
          Cobrado
        </span>
        <b className="num">{usd(row.collected)}</b>
      </div>
      <div className="mt-1 text-[12px] text-ink-2">{row.count} presupuestos emitidos</div>
    </div>
  )
}

/** Presupuestado (tinta) vs cobrado (rojo) por mes */
export function MonthlyChart({ data, height = 300 }: { data: MonthRow[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={INK} strokeOpacity={0.1} />
          <XAxis
            dataKey="key"
            tickFormatter={monthLabel}
            tick={{ fill: "#4A5263", fontSize: 12, fontFamily: "Mona Sans" }}
            axisLine={{ stroke: INK, strokeWidth: 2 }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={6}
            height={28}
          />
          <YAxis
            tickFormatter={usdShort}
            tick={{ fill: "#4A5263", fontSize: 12, fontFamily: "Mona Sans" }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip content={<MonthTooltip />} cursor={{ fill: INK, fillOpacity: 0.06 }} />
          <Bar dataKey="budgeted" name="Presupuestado" fill={INK} radius={0} isAnimationActive={false} />
          <Bar dataKey="collected" name="Cobrado" fill={RED} radius={0} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
