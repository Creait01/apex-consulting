import type React from "react"
import type { Metadata, Viewport } from "next"
import "./globals.css"
import { AuthProvider } from "@/hooks/useAuth"

export const metadata: Metadata = {
  title: { default: "Apex · Administración", template: "%s · Apex" },
  description: "Presupuestos, cobros y cuentas por cobrar de Apex Consulting.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
}

export const viewport: Viewport = {
  themeColor: "#070B17",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-VE">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Mona Sans es la única familia de la marca (manual §4) */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Mona+Sans:wdth,wght@75..125,300..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
