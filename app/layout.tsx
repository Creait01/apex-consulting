import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Bricolage_Grotesque, Newsreader, Martian_Mono } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/hooks/useAuth"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

// Landing: display, cuerpo y cifras del libro mayor
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
})

// Next no trae métricas de respaldo para Newsreader, así que declaramos la
// pila explícita y desactivamos el ajuste automático. Sin esto el cuerpo de
// texto salta al terminar de cargar la fuente.
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
  adjustFontFallback: false,
})

const martianMono = Martian_Mono({
  subsets: ["latin"],
  variable: "--font-ledger",
  display: "swap",
})

export const metadata: Metadata = {
  title: "APEX CONSULTING | Sistemas de gestión a medida",
  description:
    "Edwin Rodriguez, desarrollador y consultor independiente. Construyo sistemas de gestión a medida e implemento Odoo para empresas que necesitan operar con datos reales.",
  keywords: ["Odoo", "ERP", "sistemas a medida", "consultoría", "desarrollo de software", "automatización"],
  authors: [{ name: "Edwin Rodriguez" }],
  openGraph: {
    title: "APEX CONSULTING | Sistemas de gestión a medida",
    description: "Sistemas de gestión a medida e implementación de Odoo para empresas.",
    type: "website",
  },
  icons: {
    icon: "/icon.svg",
  },
}

export const viewport: Viewport = {
  themeColor: "#FBFBF7",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className="dark">
      <body
        className={`${inter.variable} ${bricolage.variable} ${newsreader.variable} ${martianMono.variable} font-sans antialiased`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
