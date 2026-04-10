import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'

// ─── Helpers internos — não exportados via index.ts ───────────────────────────

export function soNumeros(v: string): string {
  return v.replace(/\D/g, '')
}

export function isCpf(cpfCnpj: string): boolean {
  return soNumeros(cpfCnpj).length === 11
}

/**
 * Busca cliente com empresa principal.
 * Tenta relação direta (legado), fallback para ClienteEmpresa (junção 1:N).
 */
export async function getClienteComEmpresa(clienteId: string) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    include: { empresa: true },
  })
  if (!cliente) return null
  if (cliente.empresa) return cliente

  // Fallback: resolve empresa via junção 1:N
  const vinculo = await prisma.clienteEmpresa.findFirst({
    where:  { clienteId, principal: true },
    select: { empresaId: true },
  })
  if (!vinculo) return { ...cliente, empresa: null }

  const empresa = await prisma.empresa.findUnique({ where: { id: vinculo.empresaId } })
  return { ...cliente, empresa }
}

/** Retorna a API key da empresa cliente (decriptada) ou null. */
export function getClienteSpedyKey(empresa: { spedyApiKey?: string | null }): string | null {
  if (!empresa.spedyApiKey) return null
  try {
    return isEncrypted(empresa.spedyApiKey) ? decrypt(empresa.spedyApiKey) : empresa.spedyApiKey
  } catch {
    return null
  }
}
