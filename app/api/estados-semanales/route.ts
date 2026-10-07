import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { runWeekly, WeeklyRunError, type WeeklyData } from "@/lib/server/weekly-run"

/* Envío automático semanal del estado de cuenta. Lo llama la base de datos
   (pg_cron → dispatch_weekly_statements, ver scripts/12) con el id de una corrida
   y su token de un solo uso; con eso se leen los datos de ese usuario, se envía
   cada correo y se anota el resultado. Sin sesión y sin clave de servicio. */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN = /^[0-9a-f]{32,128}$/i

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const run = String(body?.run ?? "")
  const token = String(body?.token ?? "")
  if (!UUID.test(run) || !TOKEN.test(token)) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.rpc("statement_run_data", { p_run: run, p_token: token })
  if (error || !data) return NextResponse.json({ error: "Corrida inválida o vencida." }, { status: 401 })

  try {
    const summary = await runWeekly(data as WeeklyData, {
      onResult: async (r) => {
        const { error } = await supabase.rpc("statement_run_log", {
          p_run: run,
          p_token: token,
          p_client: r.client,
          p_recipients: r.recipients,
          p_subject: r.subject,
          p_amount: Math.round(r.amount * 100) / 100,
          p_status: r.status,
          p_error: r.error ?? null,
        })
        if (error) console.error("[estados-semanales] registro", error)
      },
    })
    // Con fallas la corrida queda abierta: la base la reintenta en la hora siguiente
    // (hasta 3 veces ese día) y salta a los que ya lo recibieron.
    if (summary.failed === 0) {
      const { error } = await supabase.rpc("statement_run_finish", { p_run: run, p_token: token, p_summary: summary })
      if (error) console.error("[estados-semanales] cierre", error)
    }
    return NextResponse.json({ ok: true, ...summary })
  } catch (e) {
    console.error("[estados-semanales]", e)
    const message = e instanceof WeeklyRunError ? e.message : "No se pudo procesar el envío semanal."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
