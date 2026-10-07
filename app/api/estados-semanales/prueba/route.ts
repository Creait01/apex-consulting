import { NextResponse } from "next/server"
import { sessionClient } from "@/lib/server/supabase"
import { runWeekly, WeeklyRunError } from "@/lib/server/weekly-run"
import { BUDGET_COLUMNS_NEW, CLIENT_COLUMNS_NEW, SETTINGS_COLUMNS_AUTO } from "@/lib/rows"
import { caracasToday } from "@/lib/weekly"

/* Prueba del envío semanal: arma exactamente los correos que saldrían hoy, pero
   todos van solo al correo del usuario con "[Prueba]" en el asunto. */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST() {
  const supabase = sessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: "La sesión venció. Vuelve a entrar." }, { status: 401 })

  const [budgets, payments, settings, clients] = await Promise.all([
    supabase.from("budgets").select(BUDGET_COLUMNS_NEW).eq("user_id", user.id).neq("status", "cancelled"),
    supabase.from("budget_payments").select("*").eq("user_id", user.id),
    supabase.from("company_settings").select(SETTINGS_COLUMNS_AUTO).eq("user_id", user.id).maybeSingle(),
    supabase.from("clients").select(CLIENT_COLUMNS_NEW).eq("user_id", user.id),
  ])
  const failed = [budgets, payments, settings, clients].find((r) => r.error)
  if (failed) {
    const missing = failed.error?.code === "42703"
    return NextResponse.json(
      { error: missing ? "Falta aplicar la migración 12 en la base de datos." : "No se pudieron leer los datos." },
      { status: missing ? 409 : 500 },
    )
  }

  try {
    const summary = await runWeekly(
      {
        today: caracasToday(),
        settings: settings.data,
        budgets: budgets.data ?? [],
        payments: payments.data ?? [],
        clients: clients.data ?? [],
      },
      {
        testTo: user.email,
        onResult: async (r) => {
          await supabase.from("email_log").insert({
            kind: "statement",
            origin: "test",
            client_name: r.client,
            recipients: r.recipients,
            subject: r.subject,
            amount: Math.round(r.amount * 100) / 100,
            status: r.status,
            error: r.error ?? null,
            user_id: user.id,
          })
        },
      },
    )
    return NextResponse.json({ ok: true, to: user.email, ...summary })
  } catch (e) {
    console.error("[estados-semanales/prueba]", e)
    const message = e instanceof WeeklyRunError ? e.message : "No se pudo armar la prueba."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
