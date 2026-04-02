'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { NotaFiscal } from './_shared'
import { STATUS_COLORS, STATUS_ICONS, STATUS_LABELS } from './_shared'

type Props = {
  nota: NotaFiscal
  onEntregar: (notaId: string, canal: 'whatsapp' | 'email') => void
  onCancelarClick: (notaId: string) => void
  onReemitirClick: (nota: NotaFiscal) => void
  entregando?: boolean
}

export function NotaFiscalCard({ nota, onEntregar, onCancelarClick, onReemitirClick, entregando }: Props) {
  const statusColor = STATUS_COLORS[nota.status] ?? 'bg-surface-container text-on-surface-variant'
  const statusLabel = STATUS_LABELS[nota.status] ?? nota.status
  const statusIcon  = STATUS_ICONS[nota.status]  ?? 'help'
  const dataRef     = nota.autorizadaEm ?? nota.criadoEm
  const dataFmt     = format(new Date(dataRef), 'dd/MM/yyyy', { locale: ptBR })
  const valorFmt    = `R$ ${Number(nota.valorTotal).toFixed(2).replace('.', ',')}`

  return (
    <div className="rounded-xl border border-outline-variant/15 bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {nota.numero && (
              <span className="text-[13px] font-bold text-on-surface">NFS-e nº {nota.numero}</span>
            )}
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColor}`}>
              <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>{statusIcon}</span>
              {statusLabel}
            </span>
            <span className="text-[11px] text-on-surface-variant/60">{dataFmt}</span>
          </div>
          <p className="mt-1 text-[12px] text-on-surface-variant/70 truncate">{nota.descricao}</p>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-[13px] font-semibold text-on-surface">{valorFmt}</span>
            <span className="text-[11px] text-on-surface-variant/60">→ {nota.tomadorNome}</span>
          </div>
          {nota.protocolo && (
            <p className="mt-0.5 text-[11px] text-on-surface-variant/50">Protocolo: {nota.protocolo}</p>
          )}
          {nota.erroMensagem && (
            <p className="mt-1 text-[11px] text-error/80">Erro: {nota.erroMensagem.slice(0, 100)}</p>
          )}
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1 shrink-0">
          {nota.spedyId && (nota.status === 'autorizada' || nota.status === 'cancelada') && (
            <>
              <a
                href={`/api/crm/notas-fiscais/${nota.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                title={nota.status === 'cancelada' ? 'Baixar PDF de cancelamento' : 'Baixar PDF'}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
              >
                <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
              </a>
              <a
                href={`/api/crm/notas-fiscais/${nota.id}/xml`}
                download
                title={nota.status === 'cancelada' ? 'Baixar XML de cancelamento' : 'Baixar XML'}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-tertiary"
              >
                <span className="material-symbols-outlined text-[18px]">code</span>
              </a>
            </>
          )}
          {nota.status === 'rejeitada' && (
            <button
              title="Corrigir e reemitir"
              onClick={() => onReemitirClick(nota)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-tertiary"
            >
              <span className="material-symbols-outlined text-[18px]">replay</span>
            </button>
          )}
          {nota.status === 'autorizada' && nota.spedyId && (
            <>
              <button
                title="Enviar via WhatsApp"
                onClick={() => onEntregar(nota.id, 'whatsapp')}
                disabled={entregando}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-green-status disabled:cursor-not-allowed disabled:opacity-40"
              >
                {entregando
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  : <span className="material-symbols-outlined text-[18px]">phone_iphone</span>}
              </button>
              <button
                title="Enviar por e-mail"
                onClick={() => onEntregar(nota.id, 'email')}
                disabled={entregando}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {entregando
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  : <span className="material-symbols-outlined text-[18px]">mail</span>}
              </button>
              <button
                title="Cancelar nota"
                onClick={() => onCancelarClick(nota.id)}
                disabled={entregando}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[18px]">remove_circle</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
