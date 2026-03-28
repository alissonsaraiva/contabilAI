import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
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

  // Resolve clienteId: sócio acessa dados da empresa do titular
  let clienteIdParaVerificar: string
  if (user.tipo === 'socio') {
    const titular = await prisma.cliente.findUnique({
      where:  { empresaId: user.empresaId },
      select: { id: true, status: true },
    })
    if (!titular) redirect('/portal/login')
    clienteIdParaVerificar = titular.id
    // Use the found cliente directly for status check
    if (titular.status === 'suspenso')  redirect('/portal/login?erro=conta_suspensa')
    if (titular.status === 'cancelado') redirect('/portal/login?erro=conta_cancelada')
    return <>{children}</>
  }

  // Verifica o status atual no banco — invalida a sessão se o cliente foi suspenso/cancelado/encerrado
  clienteIdParaVerificar = user.id
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
