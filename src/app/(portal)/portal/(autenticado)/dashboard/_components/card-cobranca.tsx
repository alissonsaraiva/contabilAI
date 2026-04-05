/**
 * CardCobranca — widget de cobrança aberta no dashboard.
 *
 * Mostra o valor, vencimento e forma de pagamento da cobrança mais próxima
 * em aberto (PENDING ou OVERDUE), com CTA direto para /portal/financeiro.
 * Omite o card quando não há cobrança pendente.
 */
import { prisma } from '@/lib/prisma'
import { formatBRL, cn } from '@/lib/utils'
import Link from 'next/link'
import { AsaasStatusCobranca } from '@prisma/client'

// PIX do Asaas expira em 24h; usamos 20h como margem
const PIX_EXPIRACAO_MS = 20 * 60 * 60 * 1000

export async function CardCobranca({ clienteId }: { clienteId: string }) {
  const cobranca = await prisma.cobrancaAsaas.findFirst({
    where: {
      clienteId,
      status: { in: [AsaasStatusCobranca.PENDING, AsaasStatusCobranca.OVERDUE] },
    },
    orderBy: { vencimento: 'asc' },
    select: {
      valor: true,
      vencimento: true,
      status: true,
      formaPagamento: true,
      atualizadoEm: true,
      pixCopiaECola: true,
    },
  })

  if (!cobranca) return null

  const valor = Number(cobranca.valor)
  const vencimento = new Date(cobranca.vencimento)
  const isOverdue = cobranca.status === AsaasStatusCobranca.OVERDUE

  // Compara apenas a parte da data (sem hora) para evitar erro de timezone.
  // Vencimento é uma data de cobrança — hora é irrelevante para o cálculo de dias.
  const hoje = new Date()
  const diffMs =
    Date.UTC(vencimento.getFullYear(), vencimento.getMonth(), vencimento.getDate()) -
    Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const diasAteVencer = Math.round(diffMs / (1000 * 60 * 60 * 24))

  const urgente = isOverdue || diasAteVencer <= 3
  const isPix = cobranca.formaPagamento === 'pix'

  const pixExpirado =
    isPix &&
    !!cobranca.pixCopiaECola &&
    !!cobranca.atualizadoEm &&
    Date.now() - new Date(cobranca.atualizadoEm).getTime() > PIX_EXPIRACAO_MS

  let vencimentoLabel: string
  if (isOverdue) {
    vencimentoLabel = `Venceu em ${vencimento.toLocaleDateString('pt-BR')}`
  } else if (diasAteVencer === 0) {
    vencimentoLabel = 'Vence hoje'
  } else if (diasAteVencer === 1) {
    vencimentoLabel = 'Vence amanhã'
  } else {
    vencimentoLabel = `Vence em ${diasAteVencer} dias`
  }

  let ctaLabel: string
  if (pixExpirado) {
    ctaLabel = 'Gerar nova cobrança →'
  } else if (isPix) {
    ctaLabel = 'Ver PIX para pagar →'
  } else {
    ctaLabel = 'Ver boleto →'
  }

  return (
    <div className={cn(
      'rounded-[16px] border shadow-sm overflow-hidden',
      urgente
        ? 'border-error/30 bg-error/5'
        : 'border-primary/20 bg-primary/5',
    )}>
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <span
            className={cn('material-symbols-outlined text-[18px]', urgente ? 'text-error' : 'text-primary')}
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {urgente ? 'error' : 'payments'}
          </span>
          <p className={cn('text-[11px] font-bold uppercase tracking-wide', urgente ? 'text-error' : 'text-primary')}>
            {isOverdue ? 'Cobrança vencida' : 'Cobrança em aberto'}
          </p>
        </div>
        <p className={cn('text-[26px] font-bold leading-none', urgente ? 'text-error' : 'text-on-surface')}>
          {formatBRL(valor)}
        </p>
        <p className="mt-1 text-[12px] text-on-surface-variant/70">
          {vencimentoLabel}
          {' · '}
          {isPix ? 'PIX' : 'Boleto'}
        </p>
        <Link
          href="/portal/financeiro"
          className={cn(
            'mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors',
            urgente ? 'bg-error hover:bg-error/90' : 'bg-primary hover:bg-primary/90',
          )}
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  )
}
