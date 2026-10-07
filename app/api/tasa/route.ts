import { NextResponse } from "next/server"

/* Tasa oficial BCV (dólar) desde DolarApi, consultada del lado del servidor y
   cacheada: el navegador no depende de CORS ni pega a la API en cada vista.
   ?historia=1 agrega las tasas diarias desde 2025 para valorar cobros pasados. */

const SOURCE = "https://ve.dolarapi.com/v1"

export const dynamic = "force-dynamic"

async function getJSON(url: string, revalidate: number) {
  try {
    const res = await fetch(url, { next: { revalidate }, headers: { accept: "application/json" } })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const withHistory = new URL(request.url).searchParams.get("historia") === "1"

  const [current, history] = await Promise.all([
    getJSON(`${SOURCE}/dolares/oficial`, 1800),
    withHistory ? getJSON(`${SOURCE}/historicos/dolares/oficial`, 21600) : Promise.resolve(null),
  ])

  const actual =
    current && Number(current.promedio) > 0
      ? { tasa: Number(current.promedio), fecha: String(current.fechaActualizacion ?? "").slice(0, 10) }
      : null

  const historia: [string, number][] = Array.isArray(history)
    ? history
        .filter((h: any) => h?.fecha >= "2025-01-01" && Number(h?.promedio) > 0)
        .map((h: any) => [String(h.fecha).slice(0, 10), Number(h.promedio)] as [string, number])
        .sort((a, b) => a[0].localeCompare(b[0]))
    : []

  return NextResponse.json(
    { actual, historia, fuente: "BCV vía DolarApi" },
    { headers: { "cache-control": "private, max-age=900" } },
  )
}
