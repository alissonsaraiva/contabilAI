'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  type NotaFiscal,
  STATUS_LABELS, STATUS_COLORS, STATUS_ICONS,
  podeCancelar, cancelamentoPrazoEsgotado,
} from './_shared'

type Props = {
  nota: NotaFiscal
  spedyConfigurado: boolean
  onCancelar: () => void
  onReemitir: () => void
}

export function PortalNotaCard({ nota, spedyConfigurado, onCancelar, onReemitir }: Props) {
  const statusColor     = STATUS_COLORS[nota.status] ?? 'bg-gray-100 text-gray-500'
  const statusLabel     = STATUS_LABELS[nota.status] ?? nota.status
  const statusIcon      = STATUS_ICONS[nota.status]  ?? 'help'
  const emProcessamento = nota.status === 'enviando' || nota.status === 'processando'
  const dataRef         = nota.autorizadaEm ?? nota.criadoEm
  const dataFmt         = format(new Date(dataRef), 'dd/MM/yyyy', { locale: ptBR })
  const valorFmt        = `R$ ${Number(nota.valorTotal).toFixed(2).replace('.', ',')}`

  return (
    <div className="rounded-2xl border border-outline-variant/15 bg-card p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col gap-3">

        {/* Cabeçalho: número, status, data */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8">
            <span className="material-symbols-outlined text-[20px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              receipt_long
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-bold text-on-surface">
                {nota.numero ? `NFS-e nº ${nota.numero}` : 'NFS-e'}
              </span>
              <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusColor}`}>
                <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>{statusIcon}</span>
                {statusLabel}
                {emProcessamento && (
                  <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-current opacity-70" />
                )}
              </span>
              <span className="text-[12px] text-on-surface-variant/50">{dataFmt}</span>
            </div>

            <p className="mt-1 text-[13px] text-on-surface-variant/70 line-clamp-1">{nota.descricao}</p>

            <div className="mt-1.5 flex items-center gap-3 flex-wrap">
              <span className="text-[15px] font-bold text-on-surface">{valorFmt}</span>
              {nota.tomadorNome && (
                <span className="text-[12px] text-on-surface-variant/50">→ {nota.tomadorNome}</span>
              )}
            </div>

            {nota.protocolo && (
              <p className="mt-1 text-[11px] text-on-surface-variant/40 font-mono">
                Protocolo: {nota.protocolo}
              </p>
            )}
          </div>
        </div>

        {/* Banner: em processamento */}
        {emProcessamento && (
          <div className="flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2">
            <span className="material-symbols-outlined text-[15px] text-blue-500 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
            <p className="text-[12px] text-blue-700">
              Sua nota está sendo processada pela prefeitura. Isso pode levar alguns minutos. Esta página atualiza automaticamente.
            </p>
          </div>
        )}

        {/* Banner: rejeição com motivo */}
        {(nota.status === 'rejeitada' || nota.status === 'erro_interno') && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-1.5">
            {nota.erroMensagem && (
              <p className="text-[12px] text-red-700">
                <span className="font-semibold">Motivo:</span> {nota.erroMensagem}
              </p>
            )}
            <p className="text-[11px] text-red-600/80">
              Verifique os dados do tomador (nome, CPF/CNPJ, município) e clique em <strong>Reemitir</strong> para corrigir e reenviar.
            </p>
          </div>
        )}

        {/* Banner: prazo de cancelamento esgotado */}
        {cancelamentoPrazoEsgotado(nota) && (
          <div className="flex items-center gap-2 rounded-xl border border-orange-500/20 bg-orange-500/5 px-3 py-2">
            <span className="material-symbols-outlined text-[14px] text-orange-500 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>schedule</span>
            <p className="text-[11px] text-orange-700">
              Prazo de cancelamento encerrado (30 dias). Para cancelamento fora do prazo, entre em contato com o escritório via suporte.
            </p>
          </div>
        )}

        {/* Ações */}
        <div className="flex flex-wrap items-center gap-2">
          {nota.spedyId && (nota.status === 'autorizada' || nota.status === 'cancelada') && (
            <>
              <a
                href={`/api/portal/notas-fiscais/${nota.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-[12px] font-semibold text-on-surface transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              >
                <span className="material-symbols-outlined text-[15px]">picture_as_pdf</span>
                Baixar PDF
              </a>
              <a
                href={`/api/portal/notas-fiscais/${nota.id}/xml`}
                download
                className="flex items-center gap-1.5 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-[12px] font-semibold text-on-surface transition-colors hover:border-tertiary/30 hover:bg-tertiary/5 hover:text-tertiary"
              >
                <span className="material-symbols-outlined text-[15px]">code</span>
                Baixar XML
              </a>
            </>
          )}

          {podeCancelar(nota) && (
            <button
              onClick={onCancelar}
              className="flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-surface-container-low px-3 py-2 text-[12px] font-semibold text-red-600 transition-colors hover:bg-red-500/10"
            >
              <span className="material-symbols-outlined text-[15px]">cancel</span>
              Cancelar nota
            </button>
          )}

          {(nota.status === 'rejeitada' || nota.status === 'erro_interno') && spedyConfigurado && (
            <button
              onClick={onReemitir}
              className="flex items-center gap-1.5 rounded-xl border border-orange-500/20 bg-orange-500/5 px-3 py-2 text-[12px] font-semibold text-orange-600 transition-colors hover:bg-orange-500/10"
            >
              <span className="material-symbols-outlined text-[15px]">replay</span>
              Corrigir e reemitir
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
