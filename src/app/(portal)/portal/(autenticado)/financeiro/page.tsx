import { auth } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { PortalFinanceiroClient } from '@/components/portal/portal-financeiro-client'

export default async function PortalFinanceiroPage() {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) redirect('/portal/login')

  const clienteId = await resolveClienteId(user)
  if (!clienteId) redirect('/portal/login')

  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: {
      valorMensal: true,
      vencimentoDia: true,
      formaPagamento: true,
      planoTipo: true,
      asaasCustomerId: true,
      empresa: { select: { regime: true, procuracaoRFAtiva: true } },
    },
  })
  if (!cliente) redirect('/portal/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-semibold text-on-surface">Financeiro</h1>
        <p className="text-sm text-on-surface-variant/70 mt-1">
          Acompanhe suas cobranças e efetue pagamentos.
        </p>
      </div>

      <PortalFinanceiroClient
        clienteId={clienteId}
        valorMensal={Number(cliente.valorMensal)}
        vencimentoDia={cliente.vencimentoDia}
        formaPagamento={cliente.formaPagamento}
        asaasAtivo={!!cliente.asaasCustomerId}
        regime={cliente.empresa?.regime ?? null}
        procuracaoRFAtiva={cliente.empresa?.procuracaoRFAtiva ?? true}
      />
    </div>
  )
}
