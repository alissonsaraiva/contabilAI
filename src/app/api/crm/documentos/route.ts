/**
 * GET /api/crm/documentos
 *
 * Endpoint genérico de busca de documentos para o picker "Arquivos do Sistema".
 *
 * Query params:
 *   clienteId  — docs do cliente (e da empresa vinculada)
 *   leadId     — docs do lead
 *   empresaId  — docs da empresa
 *   search     — filtro textual (nome, tipo, cliente)
 *   categoria  — filtro de categoria
 *
 * Quando nenhum contexto (clienteId/leadId/empresaId) é fornecido,
 * exige `search` para evitar retornar todos os documentos do sistema.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { unaccentSearch } from '@/lib/search'
import { CategoriaDocumento } from '@prisma/client'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const clienteId = searchParams.get('clienteId')
  const leadId    = searchParams.get('leadId')
  const empresaId = searchParams.get('empresaId')
  const search    = searchParams.get('search')?.trim()
  const categoria = searchParams.get('categoria')

  // Cross-client search: exige ao menos 2 caracteres
  const hasContext = !!(clienteId || leadId || empresaId)
  if (!hasContext && (!search || search.length < 2)) {
    return NextResponse.json([])
  }

  // Monta filtro OR para cross-client search
  type WhereDoc = {
    id?: { in: string[] }
    clienteId?: string
    leadId?: string
    empresaId?: string
    categoria?: CategoriaDocumento
  }
  const where: WhereDoc = {}

  if (clienteId)  where.clienteId  = clienteId
  else if (leadId)    where.leadId     = leadId
  else if (empresaId) where.empresaId  = empresaId

  if (categoria) where.categoria = categoria as CategoriaDocumento

  // Filtro de busca textual (accent-insensitive)
  if (search) {
    const docIds = await unaccentSearch({
      sql: `
        SELECT DISTINCT d.id FROM documentos d
        LEFT JOIN clientes c ON c.id = d."clienteId"
        WHERE d."deletadoEm" IS NULL AND (
          f_unaccent(d.nome) ILIKE f_unaccent($1)
          OR f_unaccent(d.tipo) ILIKE f_unaccent($1)
          OR f_unaccent(c.nome) ILIKE f_unaccent($1)
        )
      `,
      term: search,
    })
    where.id = { in: docIds }
  }

  // Para cliente PJ: inclui documentos de TODAS as empresas vinculadas (1:N)
  let empresaIds: string[] = []
  if (clienteId && !empresaId) {
    const vinculos = await prisma.clienteEmpresa.findMany({
      where: { clienteId },
      select: { empresaId: true },
    })
    empresaIds = vinculos.map(v => v.empresaId)
    // Fallback legado
    if (empresaIds.length === 0) {
      const c = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { empresaId: true } })
      if (c?.empresaId) empresaIds = [c.empresaId]
    }
  }

  const docSelect = {
    id: true, nome: true, tipo: true, categoria: true,
    origem: true, url: true, mimeType: true, tamanho: true,
    status: true, criadoEm: true, empresaId: true,
    cliente: { select: { id: true, nome: true } },
    empresa: { select: { id: true, nomeFantasia: true, razaoSocial: true, cnpj: true } },
  } as const

  const [docsPrimarios, docsEmpresa] = await Promise.all([
    prisma.documento.findMany({
      where: { ...where, deletadoEm: null },
      orderBy: { criadoEm: 'desc' },
      take: 60,
      select: docSelect,
    }),
    // Docs de todas as empresas vinculadas ao cliente
    empresaIds.length > 0
      ? prisma.documento.findMany({
          where: {
            empresaId: { in: empresaIds },
            deletadoEm: null,
            ...(categoria ? { categoria: categoria as CategoriaDocumento } : {}),
            ...(search ? {
              id: { in: await unaccentSearch({
                sql: `SELECT id FROM documentos WHERE "deletadoEm" IS NULL AND (f_unaccent(nome) ILIKE f_unaccent($1) OR f_unaccent(tipo) ILIKE f_unaccent($1))`,
                term: search,
              }) },
            } : {}),
          },
          orderBy: { criadoEm: 'desc' },
          take: 60,
          select: docSelect,
        })
      : Promise.resolve([]),
  ])

  // Merge, dedup por id, ordena por data
  const seen = new Set<string>()
  const todos = [...docsPrimarios, ...docsEmpresa].filter(d => {
    if (seen.has(d.id)) return false
    seen.add(d.id)
    return true
  }).sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
    .map(d => ({ ...d, tamanho: d.tamanho != null ? Number(d.tamanho) : null }))

  return NextResponse.json(todos)
}
