import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { CrmSidebar } from '@/components/layout/crm-sidebar'
import { CrmHeader } from '@/components/layout/crm-header'
import { getEscritorioConfig } from '@/lib/escritorio'
import { getAiConfig } from '@/lib/ai/config'
import { AssistenteProvider } from '@/components/crm/assistente-context'
import { AssistenteCRM } from '@/components/crm/assistente-crm'
import { Toaster } from '@/components/ui/sonner'

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const [pendingEscalacoes, pendingEmails, pendingChamados, escritorio, aiConfig] = await Promise.all([
    prisma.escalacao.count({ where: { status: 'pendente' } }).catch(() => 0),
    prisma.interacao.count({ where: { tipo: 'email_recebido', respondidoEm: null } }).catch(() => 0),
    prisma.chamado.count({ where: { status: 'aberta' } }).catch(() => 0),
    getEscritorioConfig(),
    getAiConfig(),
  ])

  return (
    <AssistenteProvider>
      <div className="flex h-screen overflow-hidden bg-surface-container-low">
        <CrmSidebar user={session.user as any} pendingEscalacoes={pendingEscalacoes} pendingEmails={pendingEmails} pendingChamados={pendingChamados} nomeEscritorio={escritorio.nome} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <CrmHeader user={session.user as any} pendingEscalacoes={pendingEscalacoes} pendingEmails={pendingEmails} pendingChamados={pendingChamados} />
          <main className="custom-scrollbar flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">{children}</main>
        </div>
      </div>
      <AssistenteCRM nomeIa={aiConfig.nomeAssistentes.crm ?? undefined} />
      <Toaster richColors position="top-right" />
    </AssistenteProvider>
  )
}
