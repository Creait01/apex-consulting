import { MARKER_PATH, MARK_VIEWBOX, RIDGE_LENGTH, RIDGE_PATH, markerTransform } from "@/lib/brand"
import { cn } from "@/lib/utils"

interface MarkProps {
  /** Color del trazo: tinta sobre papel, blanco sobre la noche */
  tone?: "ink" | "snow"
  className?: string
  /** Grosor del trazo en unidades del SVG (4,5 base; 7–9 en tamaños chicos) */
  stroke?: number
  draw?: boolean
}

export function Mark({ tone = "ink", className, stroke = 8, draw = false }: MarkProps) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      className={cn(draw && "ridge-draw", className)}
      style={{ ["--len" as string]: RIDGE_LENGTH }}
      aria-hidden="true"
    >
      <path
        d={RIDGE_PATH}
        fill="none"
        stroke={tone === "ink" ? "#0E1422" : "#F3F5FB"}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* En tamaños chicos el marcador se agranda para que se vea (como la versión de perfil) */}
      <path d={MARKER_PATH} fill="#E8380D" transform={markerTransform(stroke, stroke > 5 ? 2.2 : 1.4)} />
    </svg>
  )
}

interface LogoProps {
  tone?: "ink" | "snow"
  className?: string
  draw?: boolean
  /** Muestra la línea CONSULTING */
  full?: boolean
}

/** Logo horizontal: marca + APEX + CONSULTING (manual §2) */
export function Logo({ tone = "ink", className, draw, full = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", tone === "ink" ? "text-ink" : "text-snow", className)}>
      <Mark tone={tone} draw={draw} className="h-auto w-[68px] shrink-0" />
      <div className="flex flex-col leading-none">
        <span className="text-[22px]" style={{ fontStretch: "125%", fontWeight: 850, letterSpacing: "0.01em" }}>
          APEX
        </span>
        {full && (
          <span
            className="mt-[5px] text-[8.5px] opacity-70"
            style={{ fontStretch: "100%", fontWeight: 500, letterSpacing: "0.44em" }}
          >
            CONSULTING
          </span>
        )}
      </div>
    </div>
  )
}
