import { NextResponse } from "next/server"
import { sessionClient } from "@/lib/server/supabase"
import { warmPdf } from "@/lib/server/pdf"

/* Abre Chrome mientras el usuario revisa el correo: cuando pulse Enviar el PDF
   sale en segundos en vez de esperar a que arranque. */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST() {
  const {
    data: { user },
  } = await sessionClient().auth.getUser()
  if (!user) return NextResponse.json({ error: "La sesión venció." }, { status: 401 })
  warmPdf().catch((e) => console.error("[enviar/preparar]", e))
  return NextResponse.json({ ok: true }, { status: 202 })
}
