import { NextResponse } from 'next/server'
import { chunkText, embedTexts, storeEmbeddings } from '@/lib/rag'
import type { EmbeddingRow } from '@/lib/rag'
import type { EscopoRAG, TipoConhecimento, CanalRAG } from '@/lib/rag/types'

export type ProcessarPayload = {
  texto: string
  escopo: EscopoRAG
  canal?: CanalRAG
  tipo: TipoConhecimento
  titulo?: string
  clienteId?: string
  leadId?: string
  documentoId?: string
  metadata?: Record<string, unknown>
}

export async function POST(req: Request) {
  const body = await req.json() as ProcessarPayload

  if (!body.texto?.trim()) {
    return NextResponse.json({ error: 'texto obrigatório' }, { status: 400 })
  }
  if (!body.escopo) {
    return NextResponse.json({ error: 'escopo obrigatório (global | cliente | lead)' }, { status: 400 })
  }
  if (!body.tipo) {
    return NextResponse.json({ error: 'tipo obrigatório' }, { status: 400 })
  }
  if (!process.env.VOYAGE_API_KEY) {
    return NextResponse.json({ error: 'VOYAGE_API_KEY não configurada' }, { status: 503 })
  }

  const chunks = chunkText(body.texto)
  if (!chunks.length) {
    return NextResponse.json({ ok: true, chunks: 0 })
  }

  const embeddings = await embedTexts(chunks)

  const rows: EmbeddingRow[] = chunks.map((conteudo, i) => ({
    escopo: body.escopo,
    canal: body.canal ?? 'geral',
    tipo: body.tipo,
    clienteId: body.clienteId,
    leadId: body.leadId,
    documentoId: body.documentoId,
    titulo: body.titulo,
    conteudo,
    metadata: { ...body.metadata, chunkIndex: i, totalChunks: chunks.length },
  }))

  await storeEmbeddings(rows, embeddings)

  return NextResponse.json({ ok: true, chunks: chunks.length })
}
