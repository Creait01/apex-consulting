"use client"

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { today } from "@/lib/format"

interface RateContext {
  /** Tasa BCV vigente (Bs por USD) o null si no se pudo consultar */
  rate: number | null
  rateDate: string | null
  loading: boolean
  /** Tasa BCV vigente en una fecha "AAAA-MM-DD" (la última publicada hasta ese día) */
  rateOn: (day: string) => number | null
}

const Ctx = createContext<RateContext>({ rate: null, rateDate: null, loading: true, rateOn: () => null })

export const useRate = () => useContext(Ctx)

const CACHE_KEY = "apex:tasa"

export function RateProvider({ children }: { children: React.ReactNode }) {
  const [rate, setRate] = useState<number | null>(null)
  const [rateDate, setRateDate] = useState<string | null>(null)
  const [history, setHistory] = useState<[string, number][]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Última tasa conocida mientras llega la nueva (o si la API no responde)
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null")
      if (cached?.tasa > 0) {
        setRate(cached.tasa)
        setRateDate(cached.fecha)
      }
    } catch {}

    let alive = true
    fetch("/api/tasa?historia=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!alive || !json) return
        if (json.actual?.tasa > 0) {
          setRate(json.actual.tasa)
          setRateDate(json.actual.fecha || today())
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(json.actual))
          } catch {}
        }
        if (Array.isArray(json.historia)) setHistory(json.historia)
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const rateOn = useCallback(
    (day: string) => {
      if (rate && rateDate && day >= rateDate) return rate
      // Búsqueda binaria de la última tasa publicada hasta `day`
      let lo = 0
      let hi = history.length - 1
      let found: number | null = null
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (history[mid][0] <= day) {
          found = history[mid][1]
          lo = mid + 1
        } else hi = mid - 1
      }
      return found ?? (day >= today() ? rate : null)
    },
    [history, rate, rateDate],
  )

  const value = useMemo(() => ({ rate, rateDate, loading, rateOn }), [rate, rateDate, loading, rateOn])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
