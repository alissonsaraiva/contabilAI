import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ReajusteMensalidadesClient } from '@/components/crm/reajuste-mensalidades-client'
import type { SessionUser } from '@/types'

export const metadata = { title: 'Reajuste de Mensalidades' }

export default async function ReajusteMensalidadesPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as SessionUser
  if (user.tipo !== 'admin') redirect('/crm/dashboard')

  // Preview: clientes elegíveis (ativo ou inadimplente, com mensalidade > 0)
  const clientes = await prisma.cliente.findMany({
    where: {
      status:      { in: ['ativo', 'inadimplente'] },
      valorMensal: { gt: 0 },
    },
    select: {
      id:                  true,
      nome:                true,
      valorMensal:         true,
      status:              true,
      asaasSubscriptionId: true,
      empresa: { select: { razaoSocial: true } },
    },
    orderBy: { nome: 'asc' },
  })

  const rows = clientes.map(c => ({
    id:          c.id,
    nome:        c.empresa?.razaoSocial ?? c.nome,
    valorMensal: Number(c.valorMensal),
    status:      c.status,
    temAsaas:    !!c.asaasSubscriptionId,
  }))

  const totalAtual       = rows.reduce((s, r) => s + r.valorMensal, 0)
  const totalComAsaas    = rows.filter(r => r.temAsaas).length
  const totalSemAsaas    = rows.filter(r => !r.temAsaas).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reajuste de Mensalidades</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aplique um reajuste percentual no valor de todos os clientes ativos e inadimplentes.
          O novo valor será propagado para o Asaas automaticamente.
        </p>
      </div>

      <ReajusteMensalidadesClient
        rows={rows}
        totalAtual={totalAtual}
        totalComAsaas={totalComAsaas}
        totalSemAsaas={totalSemAsaas}
      />
    </div>
  )
}
