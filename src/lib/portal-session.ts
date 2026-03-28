/**
 * Helper para resolver dados da sessão do portal.
 * Sócios compartilham os dados da empresa do titular.
 */
import { prisma } from '@/lib/prisma'

type PortalUser = {
  id: string
  name?: string | null
  email?: string | null
  tipo: 'cliente' | 'socio'
  empresaId: string
}

/**
 * Resolve o clienteId titular da empresa a partir da sessão do portal.
 * Retorna null se não encontrado.
 */
export async function resolveClienteId(user: PortalUser): Promise<string | null> {
  if (user.tipo === 'cliente') return user.id
  const titular = await prisma.cliente.findUnique({
    where:  { empresaId: user.empresaId },
    select: { id: true },
  })
  return titular?.id ?? null
}
