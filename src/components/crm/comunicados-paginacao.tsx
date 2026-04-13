'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

interface Props {
  pagina:       number
  totalPaginas: number
  total:        number
  porPagina:    number
}

export function ComunicadosPaginacao({ pagina, totalPaginas, total, porPagina }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const sp       = useSearchParams()

  if (totalPaginas <= 1) return null

  function ir(p: number) {
    const next = new URLSearchParams(sp.toString())
    next.set('pagina', String(p))
    router.push(`${pathname}?${next.toString()}`)
  }

  const inicio = (pagina - 1) * porPagina + 1
  const fim    = Math.min(pagina * porPagina, total)

  return (
    <div className="flex items-center justify-between gap-4 border-t border-outline-variant/15 pt-4">
      <p className="text-[12px] text-on-surface-variant/60 tabular-nums">
        {inicio}–{fim} de {total}
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => ir(1)}
          disabled={pagina === 1}
          aria-label="Primeira página"
          title="Primeira página"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-30 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">first_page</span>
        </button>
        <button
          onClick={() => ir(pagina - 1)}
          disabled={pagina === 1}
          aria-label="Página anterior"
          title="Página anterior"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-30 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_left</span>
        </button>

        <span className="px-3 text-[13px] font-semibold text-on-surface tabular-nums" aria-live="polite">
          {pagina} / {totalPaginas}
        </span>

        <button
          onClick={() => ir(pagina + 1)}
          disabled={pagina === totalPaginas}
          aria-label="Próxima página"
          title="Próxima página"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-30 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_right</span>
        </button>
        <button
          onClick={() => ir(totalPaginas)}
          disabled={pagina === totalPaginas}
          aria-label="Última página"
          title="Última página"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container disabled:opacity-30 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">last_page</span>
        </button>
      </div>
    </div>
  )
}
