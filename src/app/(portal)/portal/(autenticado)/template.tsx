import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

// Template re-renderiza a cada navegação (diferente de layout que é cacheado).
// Isso garante que uma suspensão/cancelamento bloqueia o acesso imediatamente,
// mesmo que o cliente já tenha uma sessão ativa.
export default async function PortalAutenticadoTemplate({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const user    = session?.user as any

  if (!user || user.tipo !== 'cliente') {
    redirect('/portal/login')
  }

  // Verifica o status atual no banco — invalida a sessão se o cliente foi suspenso/cancelado/encerrado
  const cliente = await prisma.cliente.findUnique({
    where:  { id: user.id },
    select: { status: true },
  })

  if (!cliente) {
    redirect('/portal/login')
  }
  if (cliente.status === 'suspenso')  redirect('/portal/login?erro=conta_suspensa')
  if (cliente.status === 'cancelado') redirect('/portal/login?erro=conta_cancelada')

  return <>{children}</>
}
