import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { resolverEmpresaPrincipalDoObjeto } from '@/lib/ai/tools/resolver-empresa'

// ─── Helpers internos — não exportados via index.ts ───────────────────────────

export function soNumeros(v: string): string {
  return v.replace(/\D/g, '')
}

export function isCpf(cpfCnpj: string): boolean {
  return soNumeros(cpfCnpj).length === 11
}

/**
 * Busca cliente com empresa principal.
 * Prioriza junção 1:N (clienteEmpresas.principal), fallback para relação direta legada.
 * Usa query única para evitar round-trips extras.
 */
export async function getClienteComEmpresa(clienteId: string) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    include: {
      empresa: true,
      clienteEmpresas: {
        where:   { principal: true },
        include: { empresa: true },
        orderBy: { principal: 'desc' as const },
        take:    1,
      },
    },
  })
  if (!cliente) return null

  // Prefere 1:N; fallback para legado 1:1
  const empresa = resolverEmpresaPrincipalDoObjeto(cliente)
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
