/**
 * Helper para resolver dados da sessão do portal.
 * Sócios compartilham os dados da empresa do titular.
 *
 * Usa ClienteEmpresa (tabela de junção 1:N) em vez de findUnique por empresaId.
 */
import { prisma } from '@/lib/prisma'

export type PortalUser = {
  id: string
  name?: string | null
  email?: string | null
  tipo: 'cliente' | 'socio'
  empresaId: string
  empresaIds?: string[] | string  // string quando vem do JWT (JSON serializado)
}

/**
 * Resolve o clienteId titular da empresa a partir da sessão do portal.
 * Busca via ClienteEmpresa (principal=true) em vez de @unique no Cliente.
 */
export async function resolveClienteId(user: PortalUser): Promise<string | null> {
  if (user.tipo === 'cliente') return user.id
  const vinculo = await prisma.clienteEmpresa.findFirst({
    where:  { empresaId: user.empresaId, principal: true },
    select: { clienteId: true },
  })
  if (vinculo) return vinculo.clienteId
  // Fallback: busca qualquer vínculo (caso principal não esteja marcado)
  const qualquer = await prisma.clienteEmpresa.findFirst({
    where:  { empresaId: user.empresaId },
    select: { clienteId: true },
    orderBy: { criadoEm: 'asc' },
  })
  return qualquer?.clienteId ?? null
}

/**
 * Carrega todas as empresaIds de um cliente (via ClienteEmpresa).
 * Retorna a principal primeiro.
 */
export async function getEmpresasCliente(clienteId: string): Promise<string[]> {
  const vinculos = await prisma.clienteEmpresa.findMany({
    where:   { clienteId },
    select:  { empresaId: true, principal: true },
    orderBy: { principal: 'desc' },
  })
  return vinculos.map(v => v.empresaId)
}

/**
 * Resolve empresaId principal de um cliente.
 * Tenta ClienteEmpresa primeiro, fallback para Cliente.empresaId (legado).
 */
export async function getEmpresaPrincipal(clienteId: string): Promise<string | null> {
  const vinculo = await prisma.clienteEmpresa.findFirst({
    where:  { clienteId, principal: true },
    select: { empresaId: true },
  })
  if (vinculo) return vinculo.empresaId
  // Fallback legado
  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: { empresaId: true },
  })
  return cliente?.empresaId ?? null
}
