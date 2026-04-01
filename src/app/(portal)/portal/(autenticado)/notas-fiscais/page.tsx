import { auth } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { resolveClienteId } from '@/lib/portal-session'
import { PortalNotasFiscaisClient } from '@/components/portal/portal-notas-fiscais-client'

export default async function PortalNotasFiscaisPage() {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) redirect('/portal/login')

  const clienteId = await resolveClienteId(user)
  if (!clienteId) redirect('/portal/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-semibold text-on-surface">Notas Fiscais</h1>
        <p className="text-sm text-on-surface-variant/70 mt-1">
          Consulte e baixe suas NFS-e emitidas pelo escritório.
        </p>
      </div>

      <PortalNotasFiscaisClient clienteId={clienteId} />
    </div>
  )
}
