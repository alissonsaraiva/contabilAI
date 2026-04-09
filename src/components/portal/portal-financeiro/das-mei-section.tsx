'use client'

import { formatBRL } from '@/lib/utils'
import type { DasMEIPortal } from './types'
import { DAS_STATUS_LABEL, DAS_STATUS_COLOR, formatarCompetencia } from './types'

type Props = {
  dasMeis: DasMEIPortal[]
  loading: boolean
  erro: string | null
  copiandoDAS: string | null
  onRecarregar: () => void
  onCopiarCodigoBarras: (dasId: string, codigo: string) => void
}

export function DasMeiSection({ dasMeis, loading, erro, copiandoDAS, onRecarregar, onCopiarCodigoBarras }: Props) {
  return (
    <div className="rounded-2xl border border-outline-variant/15 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant/10">
        <span className="material-symbols-outlined text-[20px] text-primary/80" style={{ fontVariationSettings: "'FILL' 1" }}>receipt_long</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-headline text-base font-semibold text-on-surface">DAS MEI</h3>
          <p className="text-[11px] text-on-surface-variant/60">Documento de Arrecadação do Simples — MEI</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10">
          <span className="material-symbols-outlined animate-spin text-[24px] text-on-surface-variant/30">progress_activity</span>
        </div>
      )}

      {!loading && erro && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="material-symbols-outlined text-[32px] text-error/50">error_outline</span>
          <p className="text-sm text-error/80">{erro}</p>
          <button
            type="button"
            onClick={onRecarregar}
            className="mt-1 text-[11px] text-primary underline underline-offset-2"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!loading && !erro && !dasMeis.length && (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-on-surface-variant/60">
          <span className="material-symbols-outlined text-[36px] opacity-30">receipt_long</span>
          <p className="text-sm">Nenhuma DAS disponível no momento.</p>
        </div>
      )}

      {!loading && !erro && dasMeis.length > 0 && (
        <div className="divide-y divide-outline-variant/10">
          {dasMeis.map(das => (
            <div key={das.id} className="flex items-center gap-3 px-5 py-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-on-surface">
                    {formatarCompetencia(das.competencia)}
                  </span>
                  <span className={`rounded-full px-2 py-[1px] text-[10px] font-bold uppercase tracking-wider ${DAS_STATUS_COLOR[das.status]}`}>
                    {DAS_STATUS_LABEL[das.status]}
                  </span>
                </div>
                {das.dataVencimento && (
                  <p className="text-[11px] text-on-surface-variant/60 mt-0.5">
                    Venc.: {new Date(das.dataVencimento).toLocaleDateString('pt-BR')}
                    {das.valor != null && ` · ${formatBRL(das.valor)}`}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {das.codigoBarras && das.status !== 'paga' && (
                  <button
                    type="button"
                    onClick={() => onCopiarCodigoBarras(das.id, das.codigoBarras!)}
                    className="flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface px-3 py-1.5 text-[11px] font-medium text-on-surface transition-colors hover:bg-surface-container active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {copiandoDAS === das.id ? 'check' : 'content_copy'}
                    </span>
                    {copiandoDAS === das.id ? 'Copiado!' : 'Copiar código'}
                  </button>
                )}
                {das.urlDas && (
                  <a
                    href={das.urlDas}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[14px]">download</span>
                    Baixar DAS
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
