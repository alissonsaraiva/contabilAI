/**
 * Helpers para agent tools resolverem empresa(s) de um cliente.
 *
 * - resolverEmpresaIdDoCliente: retorna a principal (backward-compat)
 * - resolverEmpresasDoCliente: retorna TODAS com dados completos (multi-empresa)
 */
import { prisma } from '@/lib/prisma'

export type EmpresaResolvida = {
  empresaId: string
  principal: boolean
  cnpj: string | null
  razaoSocial: string | null
  nomeFantasia: string | null
  regime: string | null
}

/** Retorna a empresaId principal do cliente. */
export async function resolverEmpresaIdDoCliente(clienteId: string): Promise<string | undefined> {
  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: { empresaId: true },
  })
  if (cliente?.empresaId) return cliente.empresaId

  const vinculo = await prisma.clienteEmpresa.findFirst({
    where:  { clienteId, principal: true },
    select: { empresaId: true },
  })
  return vinculo?.empresaId ?? undefined
}

/** Retorna TODAS as empresas do cliente com dados básicos. Principal vem primeiro. */
export async function resolverEmpresasDoCliente(clienteId: string): Promise<EmpresaResolvida[]> {
  const vinculos = await prisma.clienteEmpresa.findMany({
    where:   { clienteId },
    include: { empresa: { select: { cnpj: true, razaoSocial: true, nomeFantasia: true, regime: true } } },
    orderBy: { principal: 'desc' },
  })

  if (vinculos.length > 0) {
    return vinculos.map(v => ({
      empresaId:    v.empresaId,
      principal:    v.principal,
      cnpj:         v.empresa.cnpj,
      razaoSocial:  v.empresa.razaoSocial,
      nomeFantasia: v.empresa.nomeFantasia,
      regime:       v.empresa.regime,
    }))
  }

  // Fallback: relação legada 1:1
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { empresa: { select: { id: true, cnpj: true, razaoSocial: true, nomeFantasia: true, regime: true } } },
  })
  if (cliente?.empresa) {
    return [{
      empresaId:    cliente.empresa.id,
      principal:    true,
      cnpj:         cliente.empresa.cnpj,
      razaoSocial:  cliente.empresa.razaoSocial,
      nomeFantasia: cliente.empresa.nomeFantasia,
      regime:       cliente.empresa.regime,
    }]
  }

  return []
}

/**
 * Resolve a empresa principal de um objeto cliente **já carregado** (com `empresa` legado
 * e/ou `clienteEmpresas`). Prioriza 1:N; fallback para 1:1 legado.
 *
 * Genérico: T é inferido do tipo de `empresa` no objeto passado — sem `as any`.
 */
export function resolverEmpresaPrincipalDoObjeto<T>(
  cliente: { empresa?: T | null; clienteEmpresas?: Array<{ empresa: T }> | null } | null | undefined,
): T | null {
  if (!cliente) return null
  return cliente.clienteEmpresas?.[0]?.empresa ?? cliente.empresa ?? null
}

/** Formata lista de empresas para texto legível (system prompt / resposta ao usuário). */
export function formatarEmpresasParaTexto(empresas: EmpresaResolvida[]): string {
  return empresas.map((e, i) => {
    const label = e.nomeFantasia ?? e.razaoSocial ?? e.cnpj ?? `Empresa ${i + 1}`
    const badges = [
      e.principal ? 'Principal' : null,
      e.regime,
      e.cnpj ? `CNPJ ${e.cnpj}` : null,
    ].filter(Boolean).join(' · ')
    return `${i + 1}. ${label} (${badges})`
  }).join('\n')
}
