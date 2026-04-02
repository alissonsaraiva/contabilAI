import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'

// ─── Helpers internos — não exportados via index.ts ───────────────────────────

export function soNumeros(v: string): string {
  return v.replace(/\D/g, '')
}

export function isCpf(cpfCnpj: string): boolean {
  return soNumeros(cpfCnpj).length === 11
}

export async function getClienteComEmpresa(clienteId: string) {
  return prisma.cliente.findUnique({
    where: { id: clienteId },
    include: { empresa: true },
  })
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
