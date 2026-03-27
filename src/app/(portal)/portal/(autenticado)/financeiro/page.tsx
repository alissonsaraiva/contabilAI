import { auth } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui/card'
import { formatBRL } from '@/lib/utils'

export default async function PortalFinanceiroPage() {
  const session   = await auth()
  const clienteId = (session?.user as any)?.id
  if (!clienteId) redirect('/portal/login')

  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: { valorMensal: true, vencimentoDia: true, formaPagamento: true, planoTipo: true },
  })
  if (!cliente) redirect('/portal/login')

  const FORMA_LABELS: Record<string, string> = {
    boleto:          'Boleto bancário',
    pix:             'PIX',
    cartao_credito:  'Cartão de crédito',
    debito_em_conta: 'Débito em conta',
    transferencia:   'Transferência bancária',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-semibold text-on-surface">Financeiro</h1>
        <p className="text-sm text-on-surface-variant/70 mt-1">
          Informações sobre sua mensalidade e forma de pagamento.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-green-status/10">
            <span className="material-symbols-outlined text-[22px] text-green-status" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
          </div>
          <p className="text-[12px] font-medium text-on-surface-variant/70">Mensalidade</p>
          <p className="text-xl font-bold text-on-surface mt-1">{formatBRL(Number(cliente.valorMensal))}</p>
        </Card>

        <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[22px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>event_repeat</span>
          </div>
          <p className="text-[12px] font-medium text-on-surface-variant/70">Dia de vencimento</p>
          <p className="text-xl font-bold text-on-surface mt-1">Todo dia {cliente.vencimentoDia}</p>
        </Card>

        <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[22px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>credit_card</span>
          </div>
          <p className="text-[12px] font-medium text-on-surface-variant/70">Forma de pagamento</p>
          <p className="text-[15px] font-bold text-on-surface mt-1">
            {FORMA_LABELS[cliente.formaPagamento] ?? cliente.formaPagamento}
          </p>
        </Card>
      </div>

      <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-[22px] text-primary mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
            info
          </span>
          <p className="text-[13px] text-on-surface-variant/80 leading-relaxed">
            Para alterar sua forma de pagamento, solicitar segunda via de boleto ou tirar dúvidas sobre cobranças,
            entre em contato com nosso escritório pelo chat ao lado ou pelo WhatsApp.
          </p>
        </div>
      </Card>
    </div>
  )
}
