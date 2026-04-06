'use client'

/**
 * LimiteMeiWidget
 *
 * Régua visual verde/amarelo/vermelho do faturamento anual MEI.
 * Baseado exclusivamente nas NFS-e autorizadas emitidas pelo sistema.
 *
 * Props:
 *   acumulado  — faturamento acumulado no ano (R$)
 *   limite     — limite anual MEI (R$ 81.000)
 *   percentual — 0–100 (cap aplicado no service)
 *   zona       — 'verde' | 'amarelo' | 'vermelho'
 *   restante   — R$ restante para o limite (0 quando acima)
 *   ano        — ano de referência
 *   variant    — 'portal' (sem breakdown mensal) | 'crm' (com breakdown)
 *   porMes     — breakdown mensal (usado apenas no CRM)
 */

import { formatBRL } from '@/lib/utils'

type PorMes = { mes: number; ano: number; total: number }

type Props = {
  acumulado:  number
  limite:     number
  percentual: number
  zona:       'verde' | 'amarelo' | 'vermelho'
  restante:   number
  ano:        number
  variant?:   'portal' | 'crm'
  porMes?:    PorMes[]
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const ZONA_BAR: Record<Props['zona'], string> = {
  verde:    'bg-green-status',
  amarelo:  'bg-orange-status',
  vermelho: 'bg-error',
}

const ZONA_TEXT: Record<Props['zona'], string> = {
  verde:    'text-green-status',
  amarelo:  'text-orange-status',
  vermelho: 'text-error',
}

const ZONA_BG: Record<Props['zona'], string> = {
  verde:    'bg-green-status/8 border-green-status/20',
  amarelo:  'bg-orange-status/8 border-orange-status/20',
  vermelho: 'bg-error/8 border-error/20',
}

const ZONA_ICON: Record<Props['zona'], string> = {
  verde:    'check_circle',
  amarelo:  'warning',
  vermelho: 'error',
}

function mensagemZona(zona: Props['zona'], restante: number, variant: 'portal' | 'crm'): string {
  if (zona === 'verde') {
    return `Faturamento dentro do limite. Restam ${formatBRL(restante)} para o teto anual.`
  }
  if (zona === 'amarelo') {
    return variant === 'portal'
      ? `Você está próximo do limite MEI. Restam ${formatBRL(restante)} para o teto anual.`
      : `Cliente próximo do limite MEI. Restam ${formatBRL(restante)} para o teto anual.`
  }
  // vermelho
  return variant === 'portal'
    ? `Limite MEI muito próximo. A AVOS já foi notificada e está tomando todas as providências para adequar sua situação fiscal. Entre em contato se precisar de mais informações.`
    : `Limite MEI crítico. Tome as providências necessárias com o cliente.`
}

export function LimiteMeiWidget({
  acumulado,
  limite,
  percentual,
  zona,
  restante,
  ano,
  variant = 'portal',
  porMes   = [],
}: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant/10">
        <span
          className="material-symbols-outlined text-[20px] text-primary/80"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          trending_up
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="font-headline text-base font-semibold text-on-surface">
            Limite MEI {ano}
          </h3>
          <p className="text-[11px] text-on-surface-variant/60">
            Calculado com base nas NFS-e emitidas neste sistema
          </p>
        </div>
        {/* Badge de percentual */}
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${ZONA_TEXT[zona]} bg-current/10`}>
          {percentual.toFixed(1)}%
        </span>
      </div>

      {/* ── Corpo ──────────────────────────────────────────────────── */}
      <div className="p-5 space-y-4">

        {/* Valores */}
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium text-on-surface-variant/60 uppercase tracking-wider">Faturado em {ano}</p>
            <p className={`text-2xl font-bold tabular-nums mt-0.5 ${ZONA_TEXT[zona]}`}>
              {formatBRL(acumulado)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium text-on-surface-variant/60 uppercase tracking-wider">Limite anual</p>
            <p className="text-sm font-semibold text-on-surface-variant mt-0.5">{formatBRL(limite)}</p>
          </div>
        </div>

        {/* Barra de progresso */}
        <div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-surface-container">
            <div
              className={`h-full rounded-full transition-all duration-500 ${ZONA_BAR[zona]}`}
              style={{ width: `${Math.max(percentual, 1)}%` }}
            />
          </div>
          {/* Marcadores de threshold */}
          <div className="relative mt-1 h-3">
            {/* 75% */}
            <div className="absolute top-0 h-2 w-px bg-orange-status/40" style={{ left: '75%' }} />
            <span className="absolute text-[9px] text-on-surface-variant/40" style={{ left: '75%', transform: 'translateX(-50%)' }}>75%</span>
            {/* 90% */}
            <div className="absolute top-0 h-2 w-px bg-error/40" style={{ left: '90%' }} />
            <span className="absolute text-[9px] text-on-surface-variant/40" style={{ left: '90%', transform: 'translateX(-50%)' }}>90%</span>
          </div>
        </div>

        {/* Mensagem por zona */}
        <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 ${ZONA_BG[zona]}`}>
          <span
            className={`material-symbols-outlined shrink-0 text-[18px] mt-0.5 ${ZONA_TEXT[zona]}`}
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {ZONA_ICON[zona]}
          </span>
          <p className={`text-[12px] leading-relaxed ${ZONA_TEXT[zona]}`}>
            {mensagemZona(zona, restante, variant)}
          </p>
        </div>

        {/* Breakdown mensal — exibido apenas no CRM e se houver dados */}
        {variant === 'crm' && porMes.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-on-surface-variant/60 uppercase tracking-wider mb-2">
              Faturamento por mês
            </p>
            <div className="divide-y divide-outline-variant/10 rounded-xl border border-outline-variant/15 overflow-hidden">
              {porMes.map(({ mes, total }) => (
                <div key={mes} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[13px] text-on-surface-variant">{MESES[mes - 1]}</span>
                  <span className="text-[13px] font-medium text-on-surface tabular-nums">
                    {formatBRL(total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Nota de rodapé */}
        <p className="text-[10px] text-on-surface-variant/40 leading-relaxed">
          * Receitas sem nota fiscal emitida por este sistema não são computadas automaticamente.
        </p>
      </div>
    </div>
  )
}
