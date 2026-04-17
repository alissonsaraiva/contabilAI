import type { Metadata } from 'next'
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
  }
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
