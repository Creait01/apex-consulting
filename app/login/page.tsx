"use client"

import type React from "react"
import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Logo, Mark } from "@/components/brand/logo"
import { Field } from "@/components/ui/kit"
import { useAuth } from "@/hooks/useAuth"

/** Solo rutas internas: evita redirecciones a otros sitios con ?next= */
const safeNext = (value: string | null) => (value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard")

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await signIn(email, password)
    if (error) {
      setError(error)
      setBusy(false)
      return
    }
    window.location.replace(safeNext(new URLSearchParams(window.location.search).get("next")))
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      <section className="bg-noche relative flex min-h-[340px] flex-col justify-between overflow-hidden px-6 pb-0 pt-7 text-snow sm:px-10 lg:px-14 lg:pt-12">
        <Logo tone="snow" draw />
        <div className="relative z-10 my-10 max-w-[620px]">
          <h1 className="display text-[40px] sm:text-[54px] xl:text-[68px]">
            Presupuestos y cobros,<span className="text-snow-mute"> en un solo lugar.</span>
          </h1>
          <p className="mt-5 max-w-md text-[16px] text-snow-2">
            El sistema administrativo de Apex Consulting: lo que se presupuesta, lo que se cobra y lo que falta, en dólares y en
            bolívares.
          </p>
        </div>
        <Mark tone="snow" stroke={2.6} draw className="-mx-6 -mb-1 h-auto w-[calc(100%+3rem)] opacity-90 sm:-mx-10 sm:w-[calc(100%+5rem)] lg:-mx-14 lg:w-[calc(100%+7rem)]" />
      </section>

      <section className="flex items-center justify-center border-ink bg-paper px-5 py-12 lg:border-l-2">
        <form onSubmit={submit} className="w-full max-w-[420px] border-2 border-ink bg-white p-6 shadow-hard-lg sm:p-8" noValidate>
          <h2 className="display text-[36px]">Entrar</h2>
          <p className="mt-2 text-[15px] text-ink-2">Con tu correo y tu contraseña.</p>

          <div className="mt-7 grid gap-5">
            <Field label="Correo" htmlFor="email">
              <input
                id="email"
                type="email"
                className="input"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field label="Contraseña" htmlFor="password">
              <div className="relative">
                <input
                  id="password"
                  type={show ? "text" : "password"}
                  className="input pr-11"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-2 hover:text-ink"
                  aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
          </div>

          {error && (
            <p className="mt-5 border-2 border-amber bg-amber-bg px-3 py-2.5 text-[14px] font-semibold text-amber" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn-ink mt-7 h-12 w-full text-[15px]" disabled={busy || !email || !password}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </section>
    </div>
  )
}
