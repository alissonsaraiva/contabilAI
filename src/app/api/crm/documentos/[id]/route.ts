/**
 * PATCH /api/crm/documentos/[id]  — edição parcial (nome, tipo, categoria, visivelPortal, observacao, status)
 * DELETE /api/crm/documentos/[id] — soft-delete + deindex RAG + remove S3
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteBySourceId } from '@/lib/rag/store'
import { deletarArquivo } from '@/lib/storage'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { CATEGORIAS_DOCUMENTO, STATUS_DOCUMENTO } from '@/lib/services/documento-categorias'
import type { CategoriaDocumento } from '@prisma/client'

const CATEGORIAS_VALIDAS = CATEGORIAS_DOCUMENTO.map(c => c.value)
const STATUS_VALIDOS: readonly string[] = STATUS_DOCUMENTO

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const doc = await prisma.documento.findUnique({
    where:  { id },
    select: { id: true, deletadoEm: true, clienteId: true, empresaId: true, leadId: true },
  })
  if (!doc)           return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (doc.deletadoEm) return NextResponse.json({ error: 'Documento deletado' }, { status: 409 })

  // Monta data apenas com campos válidos presentes no body
  const data: Record<string, unknown> = {}

  if (typeof body.nome === 'string' && body.nome.trim()) {
    data.nome = body.nome.trim()
  }
  if (typeof body.tipo === 'string' && body.tipo.trim()) {
    data.tipo = body.tipo.trim()
  }
  if (typeof body.categoria === 'string' && CATEGORIAS_VALIDAS.includes(body.categoria as CategoriaDocumento)) {
    data.categoria = body.categoria
  }
  if (typeof body.visivelPortal === 'boolean') {
    data.visivelPortal = body.visivelPortal
  }
  if (typeof body.observacao === 'string') {
    data.observacao = body.observacao.trim() || null
  }
  if (typeof body.status === 'string' && STATUS_VALIDOS.includes(body.status)) {
    data.status = body.status
  }
  if (body.dataVencimento !== undefined) {
    data.dataVencimento = body.dataVencimento ? new Date(body.dataVencimento as string) : null
    // Reset lembretes ao alterar vencimento para que novos lembretes sejam enviados
    data.lembrete5dEnviadoEm = null
    data.lembreteDiaEnviadoEm = null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo válido para atualizar' }, { status: 400 })
  }

  try {
    const updated = await prisma.documento.update({
      where: { id },
      data,
      select: {
        id: true, nome: true, tipo: true, categoria: true,
        visivelPortal: true, observacao: true, status: true,
        origem: true, mimeType: true, tamanho: true, criadoEm: true,
        url: true, xmlMetadata: true, resumoStatus: true, dataVencimento: true,
      },
    })

    // Re-indexa no RAG se campos semânticos mudaram (fire-and-forget)
    if (data.nome || data.tipo || data.categoria || data.dataVencimento !== undefined) {
      indexarAsync('documento', {
        id:             updated.id,
        clienteId:      doc.clienteId,
        empresaId:      doc.empresaId,
        leadId:         doc.leadId,
        tipo:           updated.tipo,
        nome:           updated.nome,
        categoria:      updated.categoria,
        origem:         updated.origem,
        criadoEm:       updated.criadoEm,
        dataVencimento: updated.dataVencimento,
      })
    }

    return NextResponse.json({
      ...updated,
      tamanho: updated.tamanho != null ? Number(updated.tamanho) : null,
    })
  } catch (err) {
    console.error('[crm/documentos/PATCH] erro:', err)
    Sentry.captureException(err, { tags: { module: 'crm-documentos', operation: 'editar-documento' }, extra: { id } })
    return NextResponse.json({ error: 'Falha ao atualizar documento' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const doc = await prisma.documento.findUnique({
    where:  { id },
    select: { id: true, url: true, deletadoEm: true },
  })

  if (!doc)            return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (doc.deletadoEm)  return NextResponse.json({ error: 'Já deletado' },    { status: 409 })

  await prisma.documento.update({
    where: { id },
    data:  { deletadoEm: new Date() },
  })

  // Remove embeddings do RAG (falha silenciosa — não bloqueia a resposta)
  deleteBySourceId(id).catch(() => {})

  // Remove arquivo do S3 (fire-and-forget — falha não impede o delete)
  if (doc.url) {
    const publicBase = (process.env.STORAGE_PUBLIC_URL ?? '').replace(/\/$/, '')
    if (publicBase && doc.url.startsWith(publicBase)) {
      const key = doc.url.slice(publicBase.length + 1)
      deletarArquivo(key).catch(err =>
        console.warn('[documentos/delete] falha ao remover arquivo do S3:', key, err),
      )
    }
  }

  return NextResponse.json({ ok: true })
}
