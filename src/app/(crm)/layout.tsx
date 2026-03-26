import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { CrmSidebar } from '@/components/layout/crm-sidebar'
import { CrmHeader } from '@/components/layout/crm-header'
import { getEscritorioConfig } from '@/lib/escritorio'

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  const [pendingEscalacoes, escritorio] = await Promise.all([
    prisma.escalacao.count({ where: { status: 'pendente' } }).catch(() => 0),
    getEscritorioConfig(),
  ])

  return (
    <div className="flex h-screen overflow-hidden bg-surface-container-low">
      <CrmSidebar user={session.user as any} pendingEscalacoes={pendingEscalacoes} nomeEscritorio={escritorio.nome} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CrmHeader user={session.user as any} />
        <main className="custom-scrollbar flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
