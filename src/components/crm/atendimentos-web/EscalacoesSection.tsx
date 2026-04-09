'use client'

import Link from 'next/link'
import type { EscalacaoWebItem } from './types'

export function EscalacoesSection({
  pendentes,
  emAtendimento,
}: {
  pendentes: EscalacaoWebItem[]
  emAtendimento: EscalacaoWebItem[]
}) {
  const todas = [...pendentes, ...emAtendimento]
  if (todas.length === 0) return null

  return (
    <div className="mt-1 border-t border-outline-variant/10">
      <div className="flex items-center gap-2 px-4 py-2">
        <span className="material-symbols-outlined text-[13px] text-error" style={{ fontVariationSettings: "'FILL' 1" }}>
          escalator_warning
        </span>
        <p className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/50">
          Escalações
        </p>
        <span className="rounded-full bg-error/10 px-1.5 text-[10px] font-bold text-error">
          {todas.length}
        </span>
      </div>
      {todas.map(esc => (
        <Link
          key={esc.id}
          href={`/crm/atendimentos/${esc.id}`}
          className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-container"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="flex-1 truncate text-[12px] font-medium text-on-surface">{esc.ultimaMensagem}</p>
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                esc.status === 'pendente'
                  ? 'bg-error/10 text-error'
                  : 'bg-orange-status/10 text-orange-status'
              }`}>
                {esc.status === 'pendente' ? 'pendente' : 'andamento'}
              </span>
            </div>
            {esc.motivoIA && (
              <p className="mt-0.5 truncate text-[11px] text-on-surface-variant/50">{esc.motivoIA}</p>
            )}
          </div>
          <span className="material-symbols-outlined mt-0.5 shrink-0 text-[14px] text-on-surface-variant/30">
            chevron_right
          </span>
        </Link>
      ))}
    </div>
  )
}
