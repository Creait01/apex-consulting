import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

/** Cliente de Supabase con la sesión del usuario (cookies): respeta RLS */
export function sessionClient() {
  const cookieStore = cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  })
}
