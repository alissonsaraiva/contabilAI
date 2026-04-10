import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { redirect } from 'next/navigation'

// Template re-renderiza a cada navegação (diferente de layout que é cacheado).
// Isso garante que uma suspensão/cancelamento bloqueia o acesso imediatamente,
// mesmo que o cliente já tenha uma sessão ativa.
export default async function PortalAutenticadoTemplate({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const user    = session?.user as any

  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    redirect('/portal/login')
  }

  // Resolve clienteId: sócio acessa dados da empresa do titular (via ClienteEmpresa)
  const clienteIdParaVerificar = await resolveClienteId(user) ?? user.id
  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteIdParaVerificar },
    select: { status: true },
  })

  if (!cliente) {
    redirect('/portal/login')
  }
  if (cliente.status === 'suspenso')  redirect('/portal/login?erro=conta_suspensa')
  if (cliente.status === 'cancelado') redirect('/portal/login?erro=conta_cancelada')

  return <>{children}</>
}
