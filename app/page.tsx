"use client"

import { useState, useEffect, useRef, type ReactNode } from "react"
import dynamic from "next/dynamic"
import Lenis from "lenis"
import { useAuth } from "@/hooks/useAuth"
import { useRouter } from "next/navigation"
import { useSupabaseData } from "@/hooks/useSupabaseData"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { InkCanvas } from "@/components/landing/ink-canvas"
import { FlowDiagram } from "@/components/landing/flow-diagram"
import { SystemWindow } from "@/components/landing/system-window"
import { Magnetic } from "@/components/landing/magnetic"
import { AvilaRidge } from "@/components/landing/avila-ridge"
import { AvilaMark } from "@/components/landing/avila-mark"
import { PEAK_M } from "@/components/landing/avila"

/* La escena WebGL se carga solo en el cliente y solo cuando hace falta */
const AvilaScene = dynamic(
  () => import("@/components/landing/avila-scene").then((m) => m.AvilaScene),
  { ssr: false },
)

/* --------------------------------------------------------------------------
   El documento
   Cada sección de esta página es una partida del libro. La barra inferior
   las asienta a medida que el lector avanza, y al final el libro cuadra.
   -------------------------------------------------------------------------- */

const ENTRIES = [
  { id: "apertura", ref: "REF-00", label: "Apertura" },
  { id: "partidas", ref: "REF-01", label: "Qué hago" },
  { id: "sistema", ref: "REF-02", label: "Sistema en producción" },
  { id: "proceso", ref: "REF-03", label: "Cómo trabajo" },
  { id: "perfil", ref: "REF-04", label: "Quién responde" },
  { id: "cierre", ref: "REF-05", label: "Cierre" },
]

const SERVICES = [
  {
    ref: "01",
    title: "Implementación de Odoo",
    detail:
      "Puesta en marcha, módulos a medida y migración de datos desde el sistema que ya usás. Trabajo con entornos de prueba separados, así nada se toca en producción hasta que vos lo aprobás.",
    tags: ["Odoo", "Python", "PostgreSQL"],
  },
  {
    ref: "02",
    title: "Sistemas de gestión a medida",
    detail:
      "Cuando el ERP no cubre un proceso propio, construyo la pieza que falta: aplicaciones web con su base de datos, permisos por usuario y reportes en PDF.",
    tags: ["Next.js", "TypeScript", "Supabase"],
  },
  {
    ref: "03",
    title: "Automatización e integraciones",
    detail:
      "Conecto los sistemas que hoy no se hablan y elimino la carga manual repetida. Menos planillas intermedias, menos datos que se copian a mano de un lado a otro.",
    tags: ["API REST", "Webhooks", "ETL"],
  },
  {
    ref: "04",
    title: "Acompañamiento técnico",
    detail:
      "Revisión de lo que ya tenés armado y decisiones de arquitectura antes de invertir. A veces el mejor entregable es decirte que no hace falta construir nada.",
    tags: ["Auditoría", "Arquitectura", "Infraestructura"],
  },
]

const PROCESS = [
  {
    n: "1",
    title: "Entender la operación",
    detail:
      "Miro cómo trabajan hoy, con planillas incluidas. El proceso real casi nunca es el que está escrito en el manual.",
  },
  {
    n: "2",
    title: "Acordar el alcance por escrito",
    detail:
      "Un presupuesto con partidas concretas y un precio cerrado. Sabés qué entra, qué no entra y cuánto cuesta antes de que yo escriba una línea de código.",
  },
  {
    n: "3",
    title: "Entregar por partes",
    detail:
      "La primera parte funcionando en semanas, no en meses. Cada entrega se usa de verdad antes de seguir con la siguiente.",
  },
  {
    n: "4",
    title: "Dejarlo andando y documentado",
    detail:
      "Migraciones versionadas, respaldos y un traspaso ordenado. El sistema tiene que sobrevivir a que yo no esté disponible.",
  },
]

/* --------------------------------------------------------------------------
   Asentar bloques al entrar en viewport
   -------------------------------------------------------------------------- */

function useReveal(rootMargin = "0px 0px -12% 0px") {
  const ref = useRef<HTMLDivElement>(null)
  const [posted, setPosted] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPosted(true)
          io.disconnect()
        }
      },
      { threshold: 0.12, rootMargin },
    )

    io.observe(el)
    return () => io.disconnect()
  }, [rootMargin])

  return { ref, posted }
}

function Reveal({
  children,
  className = "",
  delay = 0,
  ruled = false,
}: {
  children: ReactNode
  className?: string
  delay?: number
  ruled?: boolean
}) {
  const { ref, posted } = useReveal()

  return (
    <div
      ref={ref}
      className={`lg-reveal ${ruled ? "lg-ruled" : ""} ${posted ? "is-posted" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

/* --------------------------------------------------------------------------
   Barra de saldo — la firma de la página
   -------------------------------------------------------------------------- */

function BalanceBar({ current, open }: { current: number; open: boolean }) {
  const entry = ENTRIES[current]
  const total = ENTRIES.length
  const settled = current + 1

  /* El scroll es un ascenso: al cierre se alcanza la cumbre del Naiguatá */
  const altitude = Math.round((settled / total) * PEAK_M)
  const atPeak = settled === total

  return (
    <div className={`lg-balance ${open ? "is-open" : ""}`} aria-hidden="true">
      <span className="lg-tick">
        <span className="lg-tick-fill" style={{ transform: `scaleX(${settled / total})` }} />
      </span>

      <div className="lg-shell flex items-center justify-between gap-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="lg-mono shrink-0 text-[var(--ink-40)]">Último asiento</span>
          <span key={entry.id} className="lg-posting flex min-w-0 items-baseline gap-2.5">
            <span className="lg-mono shrink-0 text-[var(--posted)]">{entry.ref}</span>
            <span className="truncate text-sm">{entry.label}</span>
          </span>
        </div>

        <div className="flex shrink-0 items-baseline gap-3">
          <span className="lg-num text-sm">
            {String(settled).padStart(2, "0")}
            <span className="text-[var(--ink-40)]">/{String(total).padStart(2, "0")}</span>
          </span>
          <span className="lg-mono hidden text-[var(--ink-40)] sm:inline">·</span>
          <span className={`lg-num hidden text-sm sm:inline ${atPeak ? "text-[var(--posted)]" : ""}`}>
            {altitude.toLocaleString("es-AR")} m{atPeak ? " — cumbre" : ""}
          </span>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------------
   Página
   -------------------------------------------------------------------------- */

export default function Home() {
  const { user } = useAuth()
  const router = useRouter()
  const { companySettings } = useSupabaseData()

  const [current, setCurrent] = useState(0)
  const [barOpen, setBarOpen] = useState(false)
  const [opened, setOpened] = useState(false)
  const [scene3d, setScene3d] = useState(false)

  const companyName = companySettings?.company_name || "APEX CONSULTING"
  const companyLogoUrl = companySettings?.company_logo_url

  // Secuencia de apertura del documento
  useEffect(() => {
    const t = window.setTimeout(() => setOpened(true), 80)
    return () => window.clearTimeout(t)
  }, [])

  // Escena 3D solo en escritorio, con WebGL y sin reduced-motion.
  // En cualquier otro caso queda el respaldo 2D (SVG + canvas de tinta).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    if (window.innerWidth < 1024) return
    try {
      const c = document.createElement("canvas")
      if (c.getContext("webgl2") || c.getContext("webgl")) setScene3d(true)
    } catch {
      /* sin WebGL: respaldo 2D */
    }
  }, [])

  // Scroll con inercia (Lenis). Los anchors compensan el encabezado fijo.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    if (window.matchMedia("(pointer: coarse)").matches) return

    const lenis = new Lenis({ duration: 1.1, anchors: { offset: -80 } })
    let rafId = 0
    const raf = (time: number) => {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }
    rafId = requestAnimationFrame(raf)
    return () => {
      cancelAnimationFrame(rafId)
      lenis.destroy()
    }
  }, [])

  // Qué partida se está asentando
  useEffect(() => {
    const sections = ENTRIES.map((e) => document.getElementById(e.id)).filter(
      (el): el is HTMLElement => el !== null,
    )
    if (!sections.length) return

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]

        if (!visible) return
        const index = ENTRIES.findIndex((e) => e.id === visible.target.id)
        if (index >= 0) setCurrent(index)
      },
      { rootMargin: "-45% 0px -45% 0px" },
    )

    sections.forEach((s) => io.observe(s))
    return () => io.disconnect()
  }, [])

  // La barra aparece recién cuando el lector deja la apertura
  useEffect(() => {
    const onScroll = () => setBarOpen(window.scrollY > window.innerHeight * 0.55)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const handleAccessSystem = () => {
    router.push(user ? "/dashboard" : "/login")
  }

  return (
    <div className={`ledger min-h-screen ${opened ? "is-opened" : ""}`}>
      {/* El Ávila en 3D, fijo detrás de todo el documento */}
      {scene3d && <AvilaScene />}

      {/* ---------------------------------------------------------------- */}
      {/* Encabezado del libro                                             */}
      {/* ---------------------------------------------------------------- */}
      <header className="sticky top-0 z-30 border-b border-[var(--rule)] bg-[rgba(251,251,247,0.9)] backdrop-blur-sm">
        <div className="lg-shell flex items-center justify-between gap-6 py-4">
          <a href="#apertura" className="flex items-center gap-3">
            {companyLogoUrl ? (
              <img src={companyLogoUrl} alt="" className="h-8 w-8 object-contain" />
            ) : (
              <AvilaMark className="h-8 w-9" />
            )}
            <span className="lg-mono text-[var(--ink)]">{companyName}</span>
          </a>

          <nav className="hidden items-center gap-7 md:flex">
            {ENTRIES.slice(1, 5).map((entry) => (
              <a key={entry.id} href={`#${entry.id}`} className="lg-mono lg-link text-[var(--ink-60)]">
                {entry.label}
              </a>
            ))}
          </nav>

          <button onClick={handleAccessSystem} className="lg-mono lg-btn lg-btn-ghost px-4 py-2">
            {user ? "Ir al panel" : "Acceso"}
          </button>
        </div>
      </header>

      <main className="relative z-[1]">
        {/* -------------------------------------------------------------- */}
        {/* REF-00 · Asiento de apertura                                   */}
        {/* -------------------------------------------------------------- */}
        <section id="apertura">
          {/* La banda del Ávila. Con 3D activo, la cordillera vive en la
              escena fija; si no, el respaldo 2D dibuja este mismo perfil. */}
          <div className="relative flex min-h-[92svh] flex-col overflow-hidden">
            {!scene3d && <InkCanvas />}
            {!scene3d && <AvilaRidge />}

            <div className="lg-shell relative z-[1] w-full pb-[38vh] pt-14 md:pt-20">
            <div
              className="lg-reveal"
              style={{ opacity: opened ? 1 : 0, transform: opened ? "none" : "translateY(16px)" }}
            >
              <div className="lg-entry lg-entry--ruled">
                <p className="lg-entry-ref lg-mono">REF-00</p>
                <div className="lg-entry-body">
                  <p className="lg-mono text-[var(--ink-40)]">Edwin Rodriguez · Desarrollador independiente</p>
                </div>
              </div>
            </div>

            <h1 className="lg-display mt-12 text-[clamp(2.6rem,7.2vw,6rem)]">
              <span className="lg-line">
                <span className="lg-line-inner" style={{ transitionDelay: "140ms" }}>
                  Construyo los sistemas
                </span>
              </span>
              <span className="lg-line">
                <span className="lg-line-inner" style={{ transitionDelay: "260ms" }}>
                  que una empresa usa
                </span>
              </span>
              <span className="lg-line">
                <span className="lg-line-inner text-[var(--posted)]" style={{ transitionDelay: "380ms" }}>
                  todos los días.
                </span>
              </span>
            </h1>

            <div
              className="mt-12 max-w-[46ch] md:ml-[calc(var(--col-ref)+var(--gut))]"
              style={{
                opacity: opened ? 1 : 0,
                transform: opened ? "none" : "translateY(18px)",
                transition:
                  "opacity 1s cubic-bezier(0.16,1,0.3,1) 480ms, transform 1s cubic-bezier(0.16,1,0.3,1) 480ms",
              }}
            >
              <p className="text-lg text-[var(--ink-60)] md:text-xl">
                Implemento Odoo y desarrollo software de gestión a medida. Trabajo solo, así que hablás siempre con la
                persona que escribe el código.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Magnetic>
                  <a href="#cierre" className="lg-mono lg-btn">
                    Conversemos
                    <ArrowRight className="lg-arrow h-3.5 w-3.5" strokeWidth={2} />
                  </a>
                </Magnetic>
                <Magnetic>
                  <a href="#sistema" className="lg-mono lg-btn lg-btn-ghost">
                    Ver un sistema real
                  </a>
                </Magnetic>
              </div>
            </div>

            </div>
          </div>

          {/* La tesis: el ciclo real del sistema, operando frente al lector */}
          <div className="lg-shell pb-24 pt-16 md:pb-32 md:pt-20">
            <div className="border-t border-[var(--ink)] pt-5">
              <p className="lg-mono mb-8 text-[var(--ink-40)]">
                Un ciclo administrativo completo, sin planillas sueltas
              </p>
              <FlowDiagram />
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------- */}
        {/* REF-01 · Partidas                                              */}
        {/* -------------------------------------------------------------- */}
        <section id="partidas" className="lg-shell py-24 md:py-36">
          <Reveal ruled className="pt-5">
            <div className="lg-entry">
              <p className="lg-mono text-[var(--ink-40)] pt-1">REF-01</p>
              <div>
                <h2 className="lg-display max-w-[18ch] text-[clamp(1.9rem,4.2vw,3.1rem)]">
                  Cuatro partidas, sin letra chica
                </h2>
              </div>
            </div>
          </Reveal>

          <div className="lg-bars mt-14">
            {SERVICES.map((service, i) => (
              <Reveal key={service.ref} delay={i * 80}>
                <article className="lg-bar-row lg-entry border-t border-[var(--rule)] px-3 py-8 md:px-5 md:py-10">
                  <p className="lg-mono pt-1 text-[var(--ink-40)]">{service.ref}</p>
                  <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-10">
                    <div>
                      <h3 className="lg-display text-2xl md:text-[1.75rem]">{service.title}</h3>
                      <p className="lg-mono mt-3 text-[var(--ink-40)]">{service.tags.join(" · ")}</p>
                    </div>
                    <p className="text-[var(--ink-60)]">{service.detail}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------------------- */}
        {/* REF-02 · Sistema en producción                                 */}
        {/* -------------------------------------------------------------- */}
        <section id="sistema" className="lg-shell py-24 md:py-36">
          <Reveal ruled className="pt-5">
            <div className="lg-entry">
              <p className="lg-mono text-[var(--ink-40)] pt-1">REF-02</p>
              <div>
                <h2 className="lg-display max-w-[20ch] text-[clamp(1.9rem,4.2vw,3.1rem)]">
                  El sistema que estás mirando ahora
                </h2>
                <p className="mt-6 max-w-[54ch] text-lg text-[var(--ink-60)]">
                  Este sitio es la puerta de entrada de un sistema de administración que uso todos los días para
                  facturar mi propio trabajo. No es una maqueta: hay datos reales del otro lado del botón de acceso.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="lg-entry mt-14">
              <p className="lg-mono hidden text-[var(--ink-40)] md:block">Alcance</p>
              <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-14">
                <dl>
                  {[
                    {
                      t: "Presupuestos y facturas",
                      d: "Numeración correlativa, partidas por ítem y salida en PDF lista para el cliente.",
                    },
                    {
                      t: "Pagos parciales",
                      d: "Un presupuesto puede cobrarse en varias veces. El sistema calcula el saldo y marca los vencidos.",
                    },
                    {
                      t: "Control de horas",
                      d: "Horas cotizadas contra horas consumidas por cliente, para saber cuándo un proyecto se pasó de largo.",
                    },
                    {
                      t: "Estado de cuenta",
                      d: "Deuda por cliente con el detalle de lo vencido, para reclamar sin discutir números.",
                    },
                  ].map((item, i) => (
                    <div key={item.t} className={`py-6 ${i > 0 ? "border-t border-[var(--rule)]" : "pt-0"}`}>
                      <dt className="lg-display text-lg">{item.t}</dt>
                      <dd className="mt-2 text-[0.98rem] text-[var(--ink-60)]">{item.d}</dd>
                    </div>
                  ))}
                </dl>

                {/* El producto, operándose solo */}
                <SystemWindow />
              </div>
            </div>
          </Reveal>

          <Reveal delay={180}>
            <div className="lg-entry mt-10">
              <p className="lg-mono hidden text-[var(--ink-40)] md:block">Construido con</p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                {["Next.js", "TypeScript", "PostgreSQL", "Supabase", "Tailwind CSS", "Railway"].map((tech) => (
                  <span key={tech} className="lg-mono text-[var(--ink-60)]">
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* -------------------------------------------------------------- */}
        {/* REF-03 · Proceso — acá la numeración sí es una secuencia real   */}
        {/* -------------------------------------------------------------- */}
        <section id="proceso" className="lg-shell py-24 md:py-36">
          <Reveal ruled className="pt-5">
            <div className="lg-entry">
              <p className="lg-mono text-[var(--ink-40)] pt-1">REF-03</p>
              <div>
                <h2 className="lg-display max-w-[18ch] text-[clamp(1.9rem,4.2vw,3.1rem)]">
                  Cómo trabajo, en orden
                </h2>
              </div>
            </div>
          </Reveal>

          <ol className="mt-14">
            {PROCESS.map((step, i) => (
              <Reveal key={step.n} delay={i * 90}>
                <li className="lg-entry border-t border-[var(--rule)] py-8 md:py-10">
                  <p className="lg-num pt-1 text-[var(--ink-40)] text-sm">
                    Paso {step.n}
                    <span className="text-[var(--rule)]"> / {PROCESS.length}</span>
                  </p>
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-10">
                    <h3 className="lg-display text-2xl md:text-[1.75rem]">{step.title}</h3>
                    <p className="text-[var(--ink-60)]">{step.detail}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* -------------------------------------------------------------- */}
        {/* REF-04 · Perfil                                                */}
        {/* -------------------------------------------------------------- */}
        <section id="perfil" className="lg-shell py-24 md:py-36">
          <Reveal ruled className="pt-5">
            <div className="lg-entry">
              <p className="lg-mono text-[var(--ink-40)] pt-1">REF-04</p>
              <div>
                <h2 className="lg-display max-w-[16ch] text-[clamp(1.9rem,4.2vw,3.1rem)]">Quién responde</h2>

                <div className="mt-8 max-w-[58ch] space-y-5 text-lg text-[var(--ink-60)]">
                  <p>
                    Soy <span className="text-[var(--ink)]">Edwin Rodriguez</span>. Llevo más de cinco años construyendo
                    software de gestión y trabajando sobre Odoo para empresas que necesitan que sus números cierren.
                  </p>
                  <p>
                    Trabajo solo y por eso soy selectivo con los proyectos que tomo. La ventaja es directa: no hay
                    cuenta de por medio, no hay teléfono descompuesto, y quien te explica una decisión técnica es el
                    mismo que la implementó.
                  </p>
                  <p>
                    Si lo que necesitás se resuelve configurando algo que ya existe, te lo digo. Cobro por resolver el
                    problema, no por escribir código.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* -------------------------------------------------------------- */}
        {/* REF-05 · Cierre — el libro cuadra                              */}
        {/* -------------------------------------------------------------- */}
        <section id="cierre" className="lg-shell py-24 md:py-36">
          <Reveal ruled className="pt-5">
            <div className="lg-entry">
              <p className="lg-mono text-[var(--ink-40)] pt-1">REF-05</p>
              <div>
                <h2 className="lg-display max-w-[16ch] text-[clamp(2.1rem,5vw,3.8rem)]">
                  Contame qué proceso te está costando.
                </h2>
                <p className="mt-7 max-w-[48ch] text-lg text-[var(--ink-60)]">
                  Una conversación de treinta minutos suele alcanzar para saber si tiene sentido trabajar juntos. Si no
                  lo tiene, te lo digo ahí mismo.
                </p>

                <div className="mt-10 flex flex-wrap items-center gap-3">
                  <Magnetic>
                    <a
                      href="mailto:Edwin.dev.21114@gmail.com?subject=Consulta%20sobre%20un%20proyecto"
                      className="lg-mono lg-btn"
                    >
                      Edwin.dev.21114@gmail.com
                      <ArrowUpRight className="lg-arrow h-3.5 w-3.5" strokeWidth={2} />
                    </a>
                  </Magnetic>
                </div>

                {/* El cuadre */}
                <div className="mt-20 border-t border-[var(--ink)] pt-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-4">
                    <p className="lg-mono text-[var(--ink-40)]">Cierre del documento</p>
                    <p className="lg-mono text-[var(--posted)]">
                      Partidas asentadas {String(ENTRIES.length).padStart(2, "0")} · El libro cuadra
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ---------------------------------------------------------------- */}
      {/* Pie                                                              */}
      {/* ---------------------------------------------------------------- */}
      <footer className="relative z-[1] border-t border-[var(--rule)] pb-24 pt-12">
        <div className="lg-shell flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <AvilaMark className="h-5 w-6" />
              <p className="lg-mono">{companyName}</p>
            </div>
            <p className="mt-1.5 text-sm text-[var(--ink-40)]">
              Sistemas de gestión a medida e implementación de Odoo.
            </p>
          </div>

          <div className="flex items-center gap-6">
            <a href="mailto:Edwin.dev.21114@gmail.com" className="lg-mono lg-link text-[var(--ink-60)]">
              Correo
            </a>
            <button onClick={handleAccessSystem} className="lg-mono lg-link text-[var(--ink-60)]">
              {user ? "Panel" : "Acceso interno"}
            </button>
            <span className="lg-mono text-[var(--ink-40)]">© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>

      <BalanceBar current={current} open={barOpen} />
    </div>
  )
}
