/* La marca: dos cordones del Ávila, el verde detrás, la tinta delante, con
   el ápice cargado a la derecha como el Naiguatá visto desde la ciudad. */
export function AvilaMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d="M0 44 L10 26 L16 32 L26 14 L33 24 L40 18 L48 30 L48 44 Z" fill="var(--posted)" opacity="0.85" />
      <path d="M0 48 L12 32 L20 38 L33 18 L48 36 L48 48 Z" fill="var(--ink)" />
    </svg>
  )
}
