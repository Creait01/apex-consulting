"use client"

import { useEffect, useMemo, useRef } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { PEAK_X, ridge } from "./avila"

/* --------------------------------------------------------------------------
   El Ávila en tres dimensiones.

   Un terreno de líneas topográficas al fondo de toda la página: las reglas
   del libro contable, extendidas en profundidad, se levantan hasta formar la
   cordillera. El scroll es el ascenso — la cámara sube hacia la cumbre del
   Naiguatá a medida que el lector baja por el documento — y la tinta suelta
   (cifras, referencias) se asienta sobre la ladera cuando el caos cuadra.

   Todo generativo: ningún modelo externo, ningún asset. Fuera del héroe la
   escena baja su presencia para no pelear con la lectura, y vuelve a subir
   en el cierre, cuando se llega a la cumbre.
   -------------------------------------------------------------------------- */

const PAPER = "#fbfbf7"
const INK = "#1a1d1a"
const GREY = "#878d86"
const GREEN = "#2f6b4f"

/* Terreno */
const T_W = 16 // ancho en unidades de mundo
const T_D = 9 // profundidad
const XSEG = 150
const ROWS = 24
const AMP = 3.4

/* Tinta */
const GLYPHS = [
  "0", "1", "2", "3", "4", "5", "7", "8", "9",
  "$", "%", "H", "N°",
  "REF", "PRE", "FAC",
  "12,5", "48.600", "27,0", "0,00", "60%",
  "—", "···",
]

/** Altura del terreno: llano contable cerca, cordillera al fondo. */
function terrainH(xn: number, zn: number): number {
  const wob = Math.sin(xn * 43.7 + zn * 17.3) * 0.05 + Math.sin(xn * 91.2 - zn * 8.1) * 0.03
  return ridge(xn) * AMP * Math.pow(zn, 1.5) + wob * zn
}

function damp(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/* Presencia de la escena a lo largo del documento: protagonista en el héroe,
   discreta durante la lectura, de vuelta al llegar a la cumbre. */
function globalOpacity(p: number) {
  if (p < 0.12) return 1
  if (p < 0.28) return 1 - ((p - 0.12) / 0.16) * 0.72
  if (p < 0.72) return 0.28
  return 0.28 + ((p - 0.72) / 0.28) * 0.42
}

function makeGlyphTexture(glyph: string, color: string): THREE.Texture {
  const size = 64
  const measure = document.createElement("canvas").getContext("2d")!
  const font = `500 ${size}px "Martian Mono", ui-monospace, Menlo, monospace`
  measure.font = font
  const w = Math.ceil(measure.measureText(glyph).width) + 8

  const c = document.createElement("canvas")
  c.width = w
  c.height = Math.ceil(size * 1.4)
  const g = c.getContext("2d")!
  g.font = font
  g.fillStyle = color
  g.textBaseline = "middle"
  g.fillText(glyph, 4, c.height / 2)

  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 2
  return tex
}

interface InkSprite {
  sprite: THREE.Sprite
  chaos: THREE.Vector3
  home: THREE.Vector3
  amp: number
  freq: number
  phase: number
  delay: number
  baseOpacity: number
}

function Scene() {
  const { camera } = useThree()
  const lineMat = useRef<THREE.LineBasicMaterial>(null)

  const progress = useRef(0)
  const settle = useRef(0)
  const mouse = useRef({ x: 0, y: 0 })
  const docH = useRef(1)

  /* --- Terreno de curvas de nivel ------------------------------------- */
  const terrain = useMemo(() => {
    const positions: number[] = []
    const colors: number[] = []
    const cLow = new THREE.Color("#dfe5db")
    const cMid = new THREE.Color("#c3cdbf")
    const cHigh = new THREE.Color(GREEN)
    const cTop = new THREE.Color(INK)

    for (let r = 0; r <= ROWS; r++) {
      const zn = r / ROWS
      const z = -zn * T_D
      for (let s = 0; s < XSEG; s++) {
        const x0 = s / XSEG
        const x1 = (s + 1) / XSEG
        const y0 = terrainH(x0, zn)
        const y1 = terrainH(x1, zn)
        positions.push((x0 - 0.5) * T_W, y0, z, (x1 - 0.5) * T_W, y1, z)

        /* color por elevación y profundidad: llano pálido, cresta entintada */
        for (const y of [y0, y1]) {
          const t = Math.min(1, y / AMP)
          const c =
            t < 0.25
              ? cLow.clone().lerp(cMid, t / 0.25)
              : t < 0.65
                ? cMid.clone().lerp(cHigh, (t - 0.25) / 0.4)
                : cHigh.clone().lerp(cTop, (t - 0.65) / 0.35)
          colors.push(c.r, c.g, c.b)
        }
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
    return geo
  }, [])

  /* --- La tinta que se asienta sobre la ladera -------------------------- */
  const ink = useMemo(() => {
    const group = new THREE.Group()
    const sprites: InkSprite[] = []
    const texCache = new Map<string, THREE.Texture>()

    for (let i = 0; i < 110; i++) {
      const roll = Math.random()
      const color = roll < 0.52 ? INK : roll < 0.9 ? GREY : GREEN
      const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
      const key = `${glyph}|${color}`
      let tex = texCache.get(key)
      if (!tex) {
        tex = makeGlyphTexture(glyph, color)
        texCache.set(key, tex)
      }

      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
      const sprite = new THREE.Sprite(mat)
      const img = tex.image as HTMLCanvasElement
      const h = 0.09 + Math.random() * 0.09
      sprite.scale.set((h * img.width) / img.height, h, 1)

      const xn = 0.03 + Math.random() * 0.94
      const zn = 0.35 + Math.random() * 0.6
      sprites.push({
        sprite,
        chaos: new THREE.Vector3((Math.random() - 0.5) * T_W * 0.9, 0.3 + Math.random() * 2.4, -Math.random() * T_D * 0.9),
        home: new THREE.Vector3((xn - 0.5) * T_W, terrainH(xn, zn) + 0.06, -zn * T_D),
        amp: 0.12 + Math.random() * 0.25,
        freq: 0.25 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        delay: Math.random() * 0.4,
        baseOpacity: color === GREEN ? 0.55 : 0.38 + Math.random() * 0.16,
      })
      group.add(sprite)
    }
    return { group, sprites }
  }, [])

  /* liberar GPU al desmontar */
  useEffect(() => {
    return () => {
      terrain.dispose()
      for (const s of ink.sprites) {
        s.sprite.material.map?.dispose()
        s.sprite.material.dispose()
      }
    }
  }, [terrain, ink])

  useEffect(() => {
    const measure = () => {
      docH.current = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
    }
    measure()
    const t = window.setTimeout(measure, 900)
    window.addEventListener("resize", measure)

    const onMouse = (e: MouseEvent) => {
      mouse.current.x = e.clientX / window.innerWidth - 0.5
      mouse.current.y = e.clientY / window.innerHeight - 0.5
    }
    window.addEventListener("mousemove", onMouse, { passive: true })
    return () => {
      window.clearTimeout(t)
      window.removeEventListener("resize", measure)
      window.removeEventListener("mousemove", onMouse)
    }
  }, [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = state.clock.elapsedTime

    /* ascenso: avance por el documento completo */
    const pTarget = Math.min(1, Math.max(0, window.scrollY / docH.current))
    progress.current = damp(progress.current, pTarget, 3.6, dt)
    const p = progress.current

    /* asentamiento de la tinta: se resuelve dentro del primer tramo */
    const sTarget = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.8)))
    settle.current = damp(settle.current, sTarget, 4.2, dt)
    const g = settle.current

    /* cámara: sube hacia la cumbre, con paralaje leve del puntero */
    const peakX = (PEAK_X - 0.5) * T_W
    camera.position.x = mouse.current.x * 0.5 + p * peakX * 0.25
    camera.position.y = 1.15 + p * 3.1 - mouse.current.y * 0.25
    camera.position.z = 4.6 - p * 2.1
    camera.lookAt(peakX * (0.3 + p * 0.7), 0.9 + p * 2.3, -T_D * 0.75)

    const gOp = globalOpacity(p)
    if (lineMat.current) lineMat.current.opacity = 0.92 * gOp

    for (const s of ink.sprites) {
      const local = Math.min(1, Math.max(0, g * 1.45 - s.delay * 0.45))
      const e = easeInOutCubic(local)
      const drift = s.amp * (1 - e)
      s.sprite.position.set(
        s.chaos.x + (s.home.x - s.chaos.x) * e + Math.sin(t * s.freq + s.phase) * drift,
        s.chaos.y + (s.home.y - s.chaos.y) * e + Math.cos(t * s.freq * 0.8 + s.phase) * drift * 0.7,
        s.chaos.z + (s.home.z - s.chaos.z) * e,
      )
      s.sprite.material.opacity = (s.baseOpacity * (1 - e) + 0.3 * e) * gOp
    }
  })

  return (
    <group position={[0, -0.4, 0]}>
      <lineSegments geometry={terrain}>
        <lineBasicMaterial ref={lineMat} vertexColors transparent opacity={0.92} />
      </lineSegments>
      <primitive object={ink.group} />
    </group>
  )
}

export function AvilaScene() {
  return (
    <div className="lg-scene" aria-hidden="true">
      <Canvas
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 42, near: 0.1, far: 45, position: [0, 1.15, 4.6] }}
      >
        <fog attach="fog" args={[PAPER, 7, 26]} />
        <Scene />
      </Canvas>
    </div>
  )
}
