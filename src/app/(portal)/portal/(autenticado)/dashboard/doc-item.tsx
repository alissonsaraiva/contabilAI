'use client'

import { cn } from '@/lib/utils'

interface DocItemProps {
  id: string
  nome: string
  ext: string
  criadoEm: string
  visualizadoEm: string | null
  extColor: string
}

export function DocItem({ id, nome, ext, criadoEm, visualizadoEm, extColor }: DocItemProps) {
  function handleClick() {
    if (!visualizadoEm) {
      fetch(`/api/portal/documentos/${id}/visualizar`, { method: 'PATCH' }).catch(() => {})
    }
    window.open(`/api/portal/documentos/${id}/download`, '_blank', 'noopener,noreferrer')
  }

  return (
    <li className={visualizadoEm ? '' : 'bg-primary/[0.03]'}>
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center gap-3 px-5 py-3 hover:bg-surface-container-lowest/40 transition-colors text-left"
      >
        <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', extColor)}>
          {ext}
        </span>
        <p className="flex-1 min-w-0 text-[13px] font-medium text-on-surface truncate">{nome}</p>
        {!visualizadoEm && (
          <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
            Novo
          </span>
        )}
        <span className="shrink-0 text-[11px] text-on-surface-variant/50">
          {new Date(criadoEm).toLocaleDateString('pt-BR')}
        </span>
        <span className="material-symbols-outlined shrink-0 text-[16px] text-on-surface-variant/30">download</span>
      </button>
    </li>
  )
}
