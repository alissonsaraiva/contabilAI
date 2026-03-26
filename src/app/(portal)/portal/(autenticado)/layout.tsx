import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getAiConfig } from '@/lib/ai/config'
import { PortalHeader } from '@/components/portal/portal-header'
import { PortalClara } from '@/components/portal/portal-clara'

export default async function PortalAutenticadoLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const user    = session?.user as any

  if (!user || user.tipo !== 'cliente') {
    redirect('/portal/login')
  }

  const aiConfig = await getAiConfig()

  return (
    <div className="min-h-screen bg-surface-container-lowest">
      <PortalHeader user={user} />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">{children}</main>
      <PortalClara nomeIa={aiConfig.nomeAssistentes.portal ?? 'Clara'} />
    </div>
  )
}
