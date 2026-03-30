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
    clienteId?: string
    leadId?: string
    empresaId?: string
    categoria?: CategoriaDocumento
    OR?: Array<{
      nome?: { contains: string; mode: 'insensitive' }
      tipo?: { contains: string; mode: 'insensitive' }
      cliente?: { nome: { contains: string; mode: 'insensitive' } }
    }>
  }
  const where: WhereDoc = {}

  if (clienteId)  where.clienteId  = clienteId
  else if (leadId)    where.leadId     = leadId
  else if (empresaId) where.empresaId  = empresaId

  if (categoria) where.categoria = categoria as CategoriaDocumento

  // Filtro de busca textual
  if (search) {
    where.OR = [
      { nome:    { contains: search, mode: 'insensitive' } },
      { tipo:    { contains: search, mode: 'insensitive' } },
      { cliente: { nome: { contains: search, mode: 'insensitive' } } },
    ]
  }

  // Para cliente PJ: inclui documentos da empresa vinculada
  let empresaIdExtra: string | null = null
  if (clienteId && !empresaId) {
    const c = await prisma.cliente.findUnique({
      where:  { id: clienteId },
      select: { empresaId: true },
    })
    if (c?.empresaId) empresaIdExtra = c.empresaId
  }

  const [docsPrimarios, docsEmpresa] = await Promise.all([
    prisma.documento.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take: 60,
      select: {
        id: true, nome: true, tipo: true, categoria: true,
        origem: true, url: true, mimeType: true, tamanho: true,
        status: true, criadoEm: true,
        cliente: { select: { id: true, nome: true } },
      },
    }),
    // Docs da empresa vinculada (só quando clienteId e empresa PJ)
    empresaIdExtra
      ? prisma.documento.findMany({
          where: {
            empresaId: empresaIdExtra,
            ...(categoria ? { categoria: categoria as CategoriaDocumento } : {}),
            ...(search ? {
              OR: [
                { nome: { contains: search, mode: 'insensitive' } },
                { tipo: { contains: search, mode: 'insensitive' } },
              ],
            } : {}),
          },
          orderBy: { criadoEm: 'desc' },
          take: 30,
          select: {
            id: true, nome: true, tipo: true, categoria: true,
            origem: true, url: true, mimeType: true, tamanho: true,
            status: true, criadoEm: true,
            cliente: { select: { id: true, nome: true } },
          },
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

  return NextResponse.json(todos)
}
