/**
 * Vincula uma empresa a um cliente, escrevendo tanto na relação 1:1 legada
 * (Cliente.empresaId) quanto na tabela de junção ClienteEmpresa.
 *
 * Usar SEMPRE que associar empresa a cliente — garante consistência entre
 * as duas estruturas durante a migração 1:1 → 1:N.
 */
import type { PrismaClient } from '@prisma/client'

type PrismaTx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

export async function vincularEmpresa(
  tx: PrismaTx,
  clienteId: string,
  empresaId: string,
  principal = true,
) {
  await Promise.all([
    // Relação legada 1:1
    tx.cliente.update({
      where: { id: clienteId },
      data:  { empresaId },
    }),
    // Tabela de junção 1:N
    tx.clienteEmpresa.create({
      data: { clienteId, empresaId, principal },
    }),
  ])
}
