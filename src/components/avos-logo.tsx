/**
 * Componentes de identidade visual da AVOS.
 *
 * AvosIcon  — ícone "A" com relâmpago em círculo navy (sidebar, header, PWA)
 * AvosWordmark — ícone + texto "AVOS" (login, onboarding)
 */

type IconProps = {
  size?: number
  className?: string
}

/** Ícone isolado: "A" com relâmpago em círculo navy */
export function AvosIcon({ size = 32, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 192 192"
      width={size}
      height={size}
      className={className}
      aria-label="AVOS"
      role="img"
    >
      <circle cx="96" cy="96" r="96" fill="#0C2240" />
      {/* Perna direita */}
      <polygon points="96,40 114,40 162,152 144,152 96,62" fill="white" />
      {/* Perna esquerda superior */}
      <polygon points="78,40 96,40 96,62 83,96 65,96" fill="white" />
      {/* Travessa */}
      <polygon points="65,96 121,96 116,110 60,110" fill="white" />
      {/* Relâmpago (peça inferior esquerda) */}
      <polygon points="55,118 38,152 56,152 73,118" fill="white" />
    </svg>
  )
}

type WordmarkProps = {
  size?: number
  /** Texto a exibir ao lado do ícone. Default: "AVOS" */
  nome?: string
  /** Subtítulo abaixo do nome (ex: "Gestão Inteligente") */
  tagline?: string
  /** Cor do texto. Default: on-surface via CSS */
  textColor?: string
  className?: string
}

/** Ícone + nome do produto lado a lado */
export function AvosWordmark({
  size = 40,
  nome = 'AVOS',
  tagline,
  textColor,
  className,
}: WordmarkProps) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      <AvosIcon size={size} />
      <div>
        <span
          className="block font-headline font-bold tracking-tight leading-none"
          style={{
            fontSize: size * 0.55,
            color: textColor ?? undefined,
          }}
        >
          {nome}
        </span>
        {tagline && (
          <span
            className="block font-medium leading-none mt-0.5 opacity-60"
            style={{ fontSize: size * 0.28, color: textColor ?? undefined }}
          >
            {tagline}
          </span>
        )}
      </div>
    </div>
  )
}
