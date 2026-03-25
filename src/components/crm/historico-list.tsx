'use client'

import { useState } from 'react'
import { formatDateTime } from '@/lib/utils'

type Interacao = {
  id: string
  tipo: string
  titulo: string | null
  conteudo: string | null
  criadoEm: Date
}

const INITIAL_COUNT = 5

export function HistoricoList({ interacoes }: { interacoes: Interacao[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? interacoes : interacoes.slice(0, INITIAL_COUNT)
  const hidden = interacoes.length - INITIAL_COUNT

  return (
    <>
      <div className="space-y-0 mt-4">
        {visible.map((interacao, idx) => (
          <div key={interacao.id} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${idx === 0 ? 'bg-primary ring-4 ring-primary/10' : 'bg-outline-variant/40'}`} />
              {idx < visible.length - 1 && (
                <div className="w-px flex-1 bg-outline-variant/20 my-1" />
              )}
            </div>
            <div className="pb-6 min-w-0 flex-1">
              <div className="flex items-start justify-between gap-4">
                <p className="text-[14px] font-semibold text-on-surface">{interacao.titulo ?? interacao.tipo}</p>
                <span className="shrink-0 text-[11px] font-medium text-on-surface-variant/70">
                  {formatDateTime(interacao.criadoEm)}
                </span>
              </div>
              {interacao.conteudo && (
                <p className="mt-1 text-sm leading-relaxed text-on-surface-variant line-clamp-2">
                  {interacao.conteudo}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {hidden > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-sm font-semibold text-primary hover:opacity-80 transition-opacity"
        >
          {expanded ? 'Ver menos' : `Ver tudo (${interacoes.length})`}
        </button>
      )}
    </>
  )
}
