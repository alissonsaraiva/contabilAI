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
import { EmpresaSelector } from '@/components/portal/empresa-selector'

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
      statusBarStyle: 'black-translucent',
      startupImage: [
        // iPhone SE (2nd/3rd gen) — 750×1334 @2x
        { url: '/splash/iphone-se.png',         media: 'screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
        // iPhone 13 mini — 1080×2340 @3x
        { url: '/splash/iphone-13-mini.png',    media: 'screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        // iPhone 14 / 15 / 16 / 14 Pro / 15 Pro / 16 Pro — 1179×2556 @3x
        { url: '/splash/iphone-14.png',         media: 'screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        // iPhone 14 Plus / 15 Plus / 16 Plus — 1290×2796 @3x
        { url: '/splash/iphone-14-plus.png',    media: 'screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        // iPhone 14 Pro Max / 15 Pro Max — 1290×2868 @3x
        { url: '/splash/iphone-14-pro-max.png', media: 'screen and (device-width: 430px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        // iPhone 16 Pro — 1206×2622 @3x
        { url: '/splash/iphone-16-pro.png',     media: 'screen and (device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        // iPhone 16 Pro Max — 1320×2868 @3x
        { url: '/splash/iphone-16-pro-max.png', media: 'screen and (device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
        // iPad Pro 11" — 1668×2388 @2x
        { url: '/splash/ipad-pro-11.png',       media: 'screen and (device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
        // iPad Pro 12.9" — 2048×2732 @2x
        { url: '/splash/ipad-pro-12.png',       media: 'screen and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      ],
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

type PortalUser = { id: string; name?: string | null; email?: string | null; tipo: 'cliente' | 'socio'; empresaId: string; empresaIds?: string }

export default async function PortalAutenticadoLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const user    = session?.user as PortalUser

  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    redirect('/portal/login')
  }

  const clienteId = await resolveClienteId(user)
  const janelaNovos = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // Parse empresaIds do JWT (JSON string) para lista de empresas do selector
  let empresaIdsParsed: string[] = []
  try {
    empresaIdsParsed = user.empresaIds ? JSON.parse(user.empresaIds) : []
  } catch (err) {
    console.error('[portal/layout] Falha ao parsear empresaIds do JWT:', { userId: user.id, empresaIds: user.empresaIds, err })
  }

  const empresaIdAtiva = user.empresaId as string | undefined

  const [aiConfig, escritorio, clienteRow, empresaAtiva, docsNovos, notasNovas, empresasSelector] = await Promise.all([
    getAiConfig(),
    getEscritorioConfig(),
    clienteId
      ? prisma.cliente.findUnique({ where: { id: clienteId }, select: { tipoContribuinte: true } })
      : Promise.resolve(null),
    empresaIdAtiva
      ? prisma.empresa.findUnique({ where: { id: empresaIdAtiva }, select: { regime: true, procuracaoRFAtiva: true } })
      : Promise.resolve(null),
    clienteId
      ? prisma.documento.count({ where: { clienteId, origem: 'crm', visualizadoEm: null, deletadoEm: null } })
      : Promise.resolve(0),
    clienteId
      ? prisma.notaFiscal.count({ where: { clienteId, status: 'autorizada', autorizadaEm: { gte: janelaNovos } } })
      : Promise.resolve(0),
    empresaIdsParsed.length > 1
      ? prisma.empresa.findMany({
          where: { id: { in: empresaIdsParsed } },
          select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true },
        })
      : Promise.resolve([]),
  ])

  return (
    <div className="min-h-screen overflow-x-hidden bg-surface-container-lowest">
      <PortalHeader
        user={user}
        nomeEscritorio={escritorio.nome}
        tipoContribuinte={clienteRow?.tipoContribuinte ?? 'pj'}
        docsNovos={docsNovos}
        notasNovas={notasNovas}
        procuracaoRFPendente={empresaAtiva?.regime === 'MEI' && empresaAtiva.procuracaoRFAtiva === false}
      />
      {empresasSelector.length > 1 && (
        <div className="mx-auto max-w-5xl px-4 pt-3 md:px-8">
          <EmpresaSelector
            empresaAtiva={user.empresaId}
            empresas={empresasSelector.map(e => ({
              id: e.id,
              label: e.nomeFantasia ?? e.razaoSocial ?? e.cnpj ?? e.id,
            }))}
          />
        </div>
      )}
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">{children}</main>
      <PortalClara nomeIa={aiConfig.nomeAssistentes.portal ?? 'Clara'} />
      <PortalPWA />
    </div>
  )
}
