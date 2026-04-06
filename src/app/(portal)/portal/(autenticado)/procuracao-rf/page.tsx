import type { Metadata } from 'next'
import { auth } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { getEscritorioConfig } from '@/lib/escritorio'
import { PortalProcuracaoClient } from '@/components/portal/portal-procuracao-client'

export const metadata: Metadata = { title: 'Autorização Receita Federal' }

export default async function PortalProcuracaoRFPage() {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) redirect('/portal/login')

  const clienteId = await resolveClienteId(user)
  if (!clienteId) redirect('/portal/login')

  const [escritorio, cliente] = await Promise.all([
    getEscritorioConfig(),
    prisma.cliente.findUnique({
      where:  { id: clienteId },
      select: {
        empresa: {
          select: {
            regime:                   true,
            procuracaoRFAtiva:        true,
            procuracaoRFVerificadaEm: true,
          },
        },
      },
    }),
  ])

  // Página só faz sentido para MEI
  if (cliente?.empresa?.regime !== 'MEI') {
    redirect('/portal/financeiro')
  }

  const nomeEscritorio = escritorio.nomeFantasia ?? escritorio.nome

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-semibold text-on-surface">Autorização Receita Federal</h1>
        <p className="text-sm text-on-surface-variant/70 mt-1">
          Gerencie a procuração digital que permite ao seu escritório acessar seus dados no e-CAC.
        </p>
      </div>

      <PortalProcuracaoClient
        nomeEscritorio={nomeEscritorio}
        procuracaoRFAtiva={cliente.empresa.procuracaoRFAtiva}
        verificadaEm={cliente.empresa.procuracaoRFVerificadaEm?.toISOString() ?? null}
      />
    </div>
  )
}
