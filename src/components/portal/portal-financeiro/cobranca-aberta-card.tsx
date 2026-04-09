'use client'

import { formatBRL } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { CobrancaAberta } from './types'
import { STATUS_LABEL, STATUS_COLOR } from './types'

type Props = {
  cobranca: CobrancaAberta
  copiado: boolean
  segundaViaLoading: boolean
  onCopiar: (texto: string) => void
  onGerarSegundaVia: (cobrancaId: string) => void
}

export function CobrancaAbertaCard({ cobranca, copiado, segundaViaLoading, onCopiar, onGerarSegundaVia }: Props) {
  const isOverdue = cobranca.status === 'OVERDUE'
  const isPix     = cobranca.formaPagamento === 'pix'
  const isBoleto  = cobranca.formaPagamento === 'boleto'
  const pixExpirado = isPix && !!cobranca.pixExpirado
  const pixValido   = isPix && !!cobranca.pixCopiaECola && !cobranca.pixExpirado
  // Segunda via: usa !!cobranca.pixExpirado direto (sem checar isPix) — fiel ao original
  const mostraSegundaVia = isOverdue || (cobranca.status === 'PENDING' && !!cobranca.pixExpirado)

  return (
    <Card className="border-outline-variant/15 bg-card shadow-sm overflow-hidden rounded-[16px]">
      {/* Header */}
      <div className={`p-4 sm:px-6 sm:py-4 border-b border-outline-variant/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isOverdue ? 'bg-error/5' : ''}`}>
        <div className="flex items-center gap-3">
          <span
            className={`material-symbols-outlined text-[20px] ${isOverdue ? 'text-error' : 'text-primary'}`}
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {isOverdue ? 'warning' : 'receipt'}
          </span>
          <div>
            <h3 className="font-headline text-base font-semibold text-on-surface">
              {isOverdue ? 'Cobrança vencida' : 'Cobrança atual'}
            </h3>
            <p className="text-[12px] text-on-surface-variant/70">
              Vencimento: {new Date(cobranca.vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="sm:text-right flex sm:block items-center justify-between">
          <p className="text-xl font-bold text-on-surface">{formatBRL(cobranca.valor)}</p>
          <span className={`text-[10px] font-bold uppercase px-2 py-[1px] rounded-full ${STATUS_COLOR[cobranca.status]}`}>
            {STATUS_LABEL[cobranca.status]}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 sm:p-6 space-y-4">
        {/* PIX expirado */}
        {pixExpirado && (
          <div className="flex items-start gap-2 rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-700 dark:bg-orange-950/30 dark:text-orange-400">
            <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">warning</span>
            <span>O código PIX pode estar expirado. Gere uma segunda via para obter um novo código atualizado.</span>
          </div>
        )}

        {/* PIX válido */}
        {pixValido && (
          <div className="space-y-4">
            {cobranca.pixQrCode && (
              <div className="flex justify-center">
                <img
                  src={`data:image/png;base64,${cobranca.pixQrCode}`}
                  alt="QR Code PIX"
                  className="h-44 w-44 rounded-xl border border-outline-variant/20 shadow-sm bg-white p-2"
                />
              </div>
            )}
            <p className="text-[13px] text-on-surface-variant/80 leading-relaxed text-center">
              Abra o app do seu banco, acesse a área PIX e escaneie o código abaixo.
            </p>
            <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container/50 px-3 py-2">
              <p className="truncate text-[11px] font-mono text-on-surface-variant">
                {cobranca.pixCopiaECola!.slice(0, 60)}…
              </p>
            </div>
            <Button
              size="default"
              onClick={() => onCopiar(cobranca.pixCopiaECola!)}
              className="w-full gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">
                {copiado ? 'check_circle' : 'content_copy'}
              </span>
              {copiado ? 'Código copiado!' : 'Copiar código PIX'}
            </Button>
            {copiado && (
              <p className="text-[11px] text-on-surface-variant/60 text-center">
                Após efetuar o pagamento, a confirmação pode levar alguns minutos.
              </p>
            )}
          </div>
        )}

        {/* Boleto */}
        {isBoleto && (
          <div className="space-y-3">
            <p className="text-[13px] text-on-surface-variant/80">
              Pague o boleto bancário no seu banco, lotérica ou pelo app do banco.
            </p>
            <div className="flex flex-wrap gap-2">
              {cobranca.linkBoleto && (
                <a
                  href={cobranca.linkBoleto}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-on-primary shadow-sm hover:bg-primary/90 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                  Abrir boleto
                </a>
              )}
              {cobranca.codigoBarras && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onCopiar(cobranca.codigoBarras!)}
                  className="gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {copiado ? 'check' : 'content_copy'}
                  </span>
                  {copiado ? 'Copiado!' : 'Copiar código de barras'}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Segunda via — vencidas ou PIX expirado */}
        {mostraSegundaVia && (
          <div className="border-t border-outline-variant/10 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onGerarSegundaVia(cobranca.id)}
              disabled={segundaViaLoading}
              className="text-xs gap-1.5"
            >
              <span className="material-symbols-outlined text-[14px]">refresh</span>
              {segundaViaLoading ? 'Gerando segunda via…' : 'Gerar segunda via (venc. em 3 dias)'}
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
