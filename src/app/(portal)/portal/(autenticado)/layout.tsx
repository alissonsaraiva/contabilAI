import type { Metadata, Viewport } from 'next'
import { auth } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { getAiConfig } from '@/lib/ai/config'
import { getEscritorioConfig } from '@/lib/escritorio'
import { resolveClienteId } from '@/lib/portal-session'
import { prisma } from '@/lib/prisma'
import { PortalHeader } from '@/components/portal/portal-header'
import { PortalClara } from '@/components/portal/portal-clara'
import { PortalPWA } from '@/components/portal/portal-pwa'

export async function generateMetadata(): Promise<Metadata> {
  const escritorio = await getEscritorioConfig()
  const nome       = escritorio.nomeFantasia ?? escritorio.nome
  return {
    title: {
      default: `Portal do Cliente — ${nome}`,
      template: `%s | ${nome}`,
    },
    description: `Área exclusiva do cliente — ${nome}`,
    appleWebApp: {
      capable:    true,
      title:      nome,
      statusBarStyle: 'default',
      startupImage: '/icons/icon-512.png',
    },
    formatDetection: { telephone: false },
    icons: {
      apple: '/icons/icon-192.png',
    },
    other: {
      'mobile-web-app-capable': 'yes',
    },
  }
}

export const viewport: Viewport = {
  themeColor:         '#0055FF',
  width:              'device-width',
  initialScale:       1,
  maximumScale:       1,
  userScalable:       false,
  viewportFit:        'cover',
}

type PortalUser = { id: string; name?: string | null; email?: string | null; tipo: 'cliente' | 'socio'; empresaId: string }

export default async function PortalAutenticadoLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const user    = session?.user as PortalUser

  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    redirect('/portal/login')
  }

  const clienteId = await resolveClienteId(user)
  const [aiConfig, escritorio, clienteRow] = await Promise.all([
    getAiConfig(),
    getEscritorioConfig(),
    clienteId
      ? prisma.cliente.findUnique({ where: { id: clienteId }, select: { tipoContribuinte: true } })
      : Promise.resolve(null),
  ])

  return (
    <div className="min-h-screen bg-surface-container-lowest">
      <PortalHeader user={user} nomeEscritorio={escritorio.nome} tipoContribuinte={clienteRow?.tipoContribuinte ?? 'pj'} />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">{children}</main>
      <PortalClara nomeIa={aiConfig.nomeAssistentes.portal ?? 'Clara'} />
      <PortalPWA />
    </div>
  )
}
