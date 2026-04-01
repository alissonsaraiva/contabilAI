/**
 * POST /api/crm/documentos/backfill-resumos
 *
 * Processa documentos existentes que ainda não têm resumo IA.
 * Executa em lotes de 20 para não sobrecarregar a API de IA.
 *
 * Admin only.
 */

import { NextResponse } from 'next/server'
import { prisma }        from '@/lib/prisma'
import { auth }          from '@/lib/auth'
import { resumirDocumento } from '@/lib/services/resumir-documento'
import pLimit from 'p-limit'

const LOTE        = 20
const CONCURRENCY = 5  // chamadas de IA em paralelo — respeita rate limits

export async function POST(req: Request) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || tipo !== 'admin') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { limite?: number }
  const limite = Math.min(body.limite ?? LOTE, 100)

  // Busca documentos sem resumo (exclui deletados e sem vínculo de cliente)
  const documentos = await prisma.documento.findMany({
    where: {
      resumo:     null,
      deletadoEm: null,
      OR: [
        { clienteId: { not: null } },
        { empresaId: { not: null } },
        { leadId:    { not: null } },
      ],
    },
    orderBy: { criadoEm: 'desc' },
    take:    limite,
    select:  { id: true, nome: true, mimeType: true },
  })

  let processados = 0
  let erros       = 0
  const detalhes: Array<{ id: string; nome: string; ok: boolean; erro?: string }> = []

  const limit = pLimit(CONCURRENCY)
  await Promise.all(documentos.map(doc =>
    limit(async () => {
      try {
        const resumo = await resumirDocumento(doc.id)
        detalhes.push({ id: doc.id, nome: doc.nome, ok: !!resumo })
        processados++
      } catch (err) {
        detalhes.push({ id: doc.id, nome: doc.nome, ok: false, erro: (err as Error).message })
        erros++
      }
    }),
  ))

  // Contagem total de documentos sem resumo restantes
  const pendentes = await prisma.documento.count({
    where: {
      resumo:     null,
      deletadoEm: null,
      OR: [
        { clienteId: { not: null } },
        { empresaId: { not: null } },
        { leadId:    { not: null } },
      ],
    },
  })

  return NextResponse.json({ processados, erros, pendentes, detalhes })
}

export async function GET() {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || tipo !== 'admin') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const [total, semResumo, comResumo] = await Promise.all([
    prisma.documento.count({ where: { deletadoEm: null } }),
    prisma.documento.count({
      where: {
        resumo:     null,
        deletadoEm: null,
        OR: [
          { clienteId: { not: null } },
          { empresaId: { not: null } },
          { leadId:    { not: null } },
        ],
      },
    }),
    prisma.documento.count({
      where: {
        resumo:     { not: null },
        deletadoEm: null,
      },
    }),
  ])

  return NextResponse.json({ total, semResumo, comResumo })
}
