import fs from "node:fs"
import chromium from "@sparticuz/chromium"
import puppeteer from "puppeteer-core"

/* PDF idéntico al que se imprime desde el navegador: el mismo HTML del reporte
   renderizado por un Chrome sin interfaz. En Render se usa el Chromium empaquetado
   de @sparticuz/chromium; en desarrollo (Windows/Mac) el Chrome instalado o el
   que indique CHROME_EXECUTABLE_PATH. */

const LOCAL_CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]

function localChrome(): string | null {
  if (process.env.CHROME_EXECUTABLE_PATH) return process.env.CHROME_EXECUTABLE_PATH
  if (process.platform === "linux") return null
  return LOCAL_CHROME.find((p) => fs.existsSync(p)) ?? null
}

/** Un Chrome abierto para generar varios PDF seguidos (el envío semanal) */
export async function openPdfRenderer() {
  const local = localChrome()
  const browser = await puppeteer.launch(
    local
      ? { executablePath: local, headless: true, args: ["--no-sandbox", "--disable-gpu"] }
      : {
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
          args: chromium.args,
          defaultViewport: chromium.defaultViewport,
        },
  )
  return {
    async render(html: string): Promise<Buffer> {
      const page = await browser.newPage()
      try {
        await page.setContent(html, { waitUntil: "networkidle0", timeout: 45_000 })
        // Mona Sans viene de Google Fonts: esperar a que cargue antes de imprimir
        await page.evaluate(() => document.fonts.ready)
        await page.emulateMediaType("print")
        const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true })
        return Buffer.from(pdf)
      } finally {
        await page.close()
      }
    },
    close: () => browser.close(),
  }
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const renderer = await openPdfRenderer()
  try {
    return await renderer.render(html)
  } finally {
    await renderer.close()
  }
}
