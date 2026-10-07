import fs from "node:fs"
import path from "node:path"
import chromium from "@sparticuz/chromium"
import puppeteer, { type Browser } from "puppeteer-core"

/* PDF idéntico al que se imprime desde el navegador: el mismo HTML del reporte
   renderizado por un Chrome sin interfaz. En Render se usa el Chromium empaquetado
   de @sparticuz/chromium; en desarrollo (Windows/Mac) el Chrome instalado o el
   que indique CHROME_EXECUTABLE_PATH.

   Abrir Chrome es lo lento (en Render gratis, con poca CPU, decenas de
   segundos), así que queda abierto entre envíos y se cierra solo tras unos
   minutos sin uso. warmPdf() lo abre de antemano al abrir el diálogo de envío. */

const LOCAL_CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]

const IDLE_MS = 3 * 60_000

/* Mona Sans va dentro del PDF desde public/fonts (latín y latín extendido, fuente
   variable de Google Fonts, licencia OFL). Descargarla de Google en cada PDF
   tomaba de 2 a 6 segundos solo en cargar la página. */
const FONT_FACES = [
  {
    file: "mona-sans-latin-ext.woff2",
    range:
      "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
  },
  {
    file: "mona-sans-latin.woff2",
    range:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  },
]

let fontCss: string | null = null

function localFontCss(): string {
  fontCss ??= FONT_FACES.map(
    (f) =>
      `@font-face{font-family:'Mona Sans';font-style:normal;font-weight:300 900;font-stretch:75% 125%;font-display:block;` +
      `src:url(data:font/woff2;base64,${fs.readFileSync(path.join(process.cwd(), "public", "fonts", f.file)).toString("base64")}) format('woff2');` +
      `unicode-range:${f.range};}`,
  ).join("")
  return fontCss
}

/** Cambia los enlaces a Google Fonts por la fuente incrustada; si falta el archivo, deja el HTML como está */
function withLocalFonts(html: string): { html: string; local: boolean } {
  try {
    const css = localFontCss()
    return { html: html.replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g, "").replace("</head>", `<style>${css}</style></head>`), local: true }
  } catch (e) {
    console.error("[pdf] sin fuente local, se usa Google Fonts", e)
    return { html, local: false }
  }
}

function localChrome(): string | null {
  if (process.env.CHROME_EXECUTABLE_PATH) return process.env.CHROME_EXECUTABLE_PATH
  if (process.platform === "linux") return null
  return LOCAL_CHROME.find((p) => fs.existsSync(p)) ?? null
}

async function launch(): Promise<Browser> {
  const local = localChrome()
  return puppeteer.launch(
    local
      ? { executablePath: local, headless: true, args: ["--no-sandbox", "--disable-gpu"] }
      : {
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
          args: chromium.args,
          defaultViewport: chromium.defaultViewport,
        },
  )
}

let browser: Promise<Browser> | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null
let active = 0

function getBrowser(): Promise<Browser> {
  if (!browser) {
    const t0 = Date.now()
    const opening = launch().then((b) => {
      console.info(`[pdf] Chrome abierto en ${Date.now() - t0} ms`)
      b.on("disconnected", () => {
        if (browser === opening) browser = null
      })
      return b
    })
    opening.catch(() => {
      if (browser === opening) browser = null
    })
    browser = opening
  }
  return browser
}

/** Programa el cierre de Chrome si nadie lo usa en unos minutos */
function scheduleClose() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (active > 0 || !browser) return
    const closing = browser
    browser = null
    closing.then((b) => b.close()).catch(() => {})
  }, IDLE_MS)
  idleTimer.unref?.()
}

/** Abre Chrome de antemano (el diálogo de envío lo pide al abrirse) */
export async function warmPdf() {
  await getBrowser()
  scheduleClose()
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  active += 1
  if (idleTimer) clearTimeout(idleTimer)
  try {
    const b = await getBrowser()
    const page = await b.newPage()
    try {
      const doc = withLocalFonts(html)
      // Con la fuente incrustada no hay nada que descargar: basta con "load"
      await page.setContent(doc.html, { waitUntil: doc.local ? "load" : "networkidle0", timeout: 45_000 })
      await page.evaluate(() => document.fonts.ready)
      await page.emulateMediaType("print")
      const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true })
      return Buffer.from(pdf)
    } finally {
      await page.close().catch(() => {})
    }
  } finally {
    active -= 1
    scheduleClose()
  }
}
