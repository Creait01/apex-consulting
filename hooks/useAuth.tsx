"use client"

import type React from "react"
import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { getClient } from "@/lib/supabase/client"

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  /** Verifica la contraseña actual antes de cambiarla */
  changePassword: (current: string, next: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth debe usarse dentro de <AuthProvider>")
  return context
}

const translate = (msg: string | undefined) => {
  if (!msg) return "No se pudo completar la operación."
  if (/invalid login credentials/i.test(msg)) return "Correo o contraseña incorrectos."
  if (/email not confirmed/i.test(msg)) return "El correo todavía no está confirmado."
  if (/should be different/i.test(msg)) return "La nueva contraseña debe ser distinta a la actual."
  if (/at least/i.test(msg)) return "La contraseña es demasiado corta."
  if (/network|fetch/i.test(msg)) return "Sin conexión con el servidor. Revisa tu internet."
  return msg
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getClient()
    let alive = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return
        setSession(data.session)
        setUser(data.session?.user ?? null)
      })
      .finally(() => alive && setLoading(false))

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setUser(next?.user ?? null)
      setLoading(false)
    })

    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      session,
      loading,
      async signIn(email, password) {
        try {
          const { error } = await getClient().auth.signInWithPassword({ email: email.trim(), password })
          return { error: error ? translate(error.message) : null }
        } catch (e: any) {
          return { error: translate(e?.message) }
        }
      },
      async signOut() {
        await getClient().auth.signOut()
        setUser(null)
        setSession(null)
      },
      async changePassword(current, next) {
        const email = user?.email
        if (!email) return { error: "Sin sesión." }
        const supabase = getClient()
        const check = await supabase.auth.signInWithPassword({ email, password: current })
        if (check.error) return { error: "La contraseña actual no es correcta." }
        const { error } = await supabase.auth.updateUser({ password: next })
        return { error: error ? translate(error.message) : null }
      },
    }),
    [user, session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
