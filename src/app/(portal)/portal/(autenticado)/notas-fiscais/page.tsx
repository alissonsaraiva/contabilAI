import { auth } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { PortalNotasFiscaisClient } from '@/components/portal/portal-notas-fiscais-client'

export default async function PortalNotasFiscaisPage() {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) redirect('/portal/login')

  const clienteId = await resolveClienteId(user)
  if (!clienteId) redirect('/portal/login')

  // NFS-e não se aplica a pessoas físicas — redireciona para o dashboard
  const cliente = await prisma.cliente.findUnique({
    where:   { id: clienteId },
    select:  {
      tipoContribuinte: true,
      empresa: {
        select: {
          razaoSocial:     true,
          nomeFantasia:    true,
          cnpj:            true,
          spedyConfigurado: true,
        },
      },
    },
  })
  if (cliente?.tipoContribuinte === 'pf') redirect('/portal/dashboard')

  const empresa = cliente?.empresa ?? null
  const spedyConfigurado = empresa?.spedyConfigurado ?? false

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-semibold text-on-surface">Notas Fiscais</h1>
        <p className="text-sm text-on-surface-variant/70 mt-1">
          Emita, consulte e baixe suas NFS-e.
        </p>
      </div>

      <PortalNotasFiscaisClient
        spedyConfigurado={spedyConfigurado}
        prestador={{
          razaoSocial:  empresa?.nomeFantasia ?? empresa?.razaoSocial ?? '',
          cnpj:         empresa?.cnpj ?? '',
        }}
      />
    </div>
  )
}
