/**
 * Busca accent-insensitive usando f_unaccent() do PostgreSQL.
 *
 * Usa raw SQL para aproveitar a extensão `unaccent`, depois devolve IDs
 * para consumo em queries Prisma normais (mantendo type safety + includes).
 */
import { prisma } from './prisma'

/**
 * Remove diacríticos de uma string (client-side).
 * Útil para normalizar input antes de comparar.
 */
export function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Executa busca accent-insensitive via raw SQL e retorna IDs.
 *
 * - `$1` é sempre `%term%` envolvido em f_unaccent().
 * - Parâmetros adicionais ($2, $3...) vêm de `extraParams`.
 *
 * Exemplo:
 * ```ts
 * const ids = await unaccentSearch({
 *   sql: `
 *     SELECT DISTINCT c.id FROM clientes c
 *     LEFT JOIN empresas e ON e.id = c."empresaId"
 *     WHERE (
 *       f_unaccent(c.nome) ILIKE f_unaccent($1)
 *       OR f_unaccent(c.email) ILIKE f_unaccent($1)
 *       OR e.cnpj LIKE $2
 *     )
 *   `,
 *   term: 'joao',
 *   extraParams: ['%12345%'],
 * })
 * ```
 */
export async function unaccentSearch(opts: {
  sql: string
  term: string
  extraParams?: unknown[]
}): Promise<string[]> {
  const { sql, term, extraParams = [] } = opts
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    sql,
    `%${term}%`,
    ...extraParams,
  )
  return rows.map(r => r.id)
}

/**
 * Helper especializado: busca clientes por nome/email/razão social (accent-insensitive)
 * + CPF/CNPJ exato. Usado por várias tools de IA e API routes.
 */
export async function searchClienteIds(
  busca: string,
  buscaNorm?: string | null,
): Promise<string[]> {
  const hasNorm = buscaNorm && buscaNorm !== busca
  const sql = `
    SELECT DISTINCT c.id FROM clientes c
    LEFT JOIN empresas e ON e.id = c."empresaId"
    WHERE (
      f_unaccent(c.nome) ILIKE f_unaccent($1)
      OR f_unaccent(c.email) ILIKE f_unaccent($1)
      OR f_unaccent(e."razaoSocial") ILIKE f_unaccent($1)
      OR c.cpf = $2 OR e.cnpj = $2
      ${hasNorm ? 'OR c.cpf = $3 OR e.cnpj = $3' : ''}
    )
  `
  return unaccentSearch({
    sql,
    term: busca,
    extraParams: hasNorm ? [busca, buscaNorm] : [busca],
  })
}
