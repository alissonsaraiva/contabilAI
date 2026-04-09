'use client'

import { formatBRL } from '@/lib/utils'
import type { CobrancaHistorico } from './types'
import { STATUS_LABEL, STATUS_COLOR } from './types'

type Props = {
  historico: CobrancaHistorico[]
  baixandoExtrato: boolean
  onBaixarExtrato: () => void
}

export function HistoricoCobrancas({ historico, baixandoExtrato, onBaixarExtrato }: Props) {
  if (!historico.length) return null

  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
      <div className="flex items-center gap-3 p-4 sm:px-6 sm:py-4 border-b border-outline-variant/10">
        <span className="material-symbols-outlined text-[20px] text-primary/80" style={{ fontVariationSettings: "'FILL' 1" }}>history</span>
        <h3 className="font-headline text-base font-semibold text-on-surface flex-1">Histórico de pagamentos</h3>
        <button
          onClick={onBaixarExtrato}
          disabled={baixandoExtrato}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-on-surface-variant hover:bg-surface-container/60 transition-colors disabled:opacity-50"
          title="Baixar extrato em CSV (compatível com Excel)"
        >
          {baixandoExtrato
            ? <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
            : <span className="material-symbols-outlined text-[14px]">download</span>
          }
          {baixandoExtrato ? 'Gerando…' : 'Exportar CSV'}
        </button>
      </div>
      <div className="divide-y divide-outline-variant/10">
        {historico.map(c => (
          <div key={c.id} className="flex flex-wrap items-center justify-between sm:justify-start gap-y-2 sm:gap-4 p-4 sm:px-6 sm:py-3.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-on-surface">
                {new Date(c.vencimento).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </p>
              {c.pagoEm && (
                <p className="text-[11px] text-green-status">
                  Pago em {new Date(c.pagoEm).toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between sm:justify-start w-full sm:w-auto basis-full sm:basis-auto mt-2 sm:mt-0 gap-3">
              <span className="text-sm font-bold text-on-surface whitespace-nowrap">
                {formatBRL(c.valorPago ?? c.valor)}
              </span>
              <span className={`rounded-full px-2 py-[1px] text-[10px] font-bold uppercase tracking-wider ${STATUS_COLOR[c.status]}`}>
                {STATUS_LABEL[c.status]}
              </span>
              {c.invoiceUrl && c.status === 'RECEIVED' && (
                <a
                  href={c.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
                  title="Abrir comprovante de pagamento"
                >
                  <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                  Comprovante
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
