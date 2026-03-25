import { NextResponse } from 'next/server'
import { chunkText, embedTexts, storeEmbeddings } from '@/lib/rag'
import type { EmbeddingRow } from '@/lib/rag'

export type ProcessarPayload = {
  texto: string
  tipo: string
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
  if (!process.env.VOYAGE_API_KEY) {
    return NextResponse.json({ error: 'VOYAGE_API_KEY não configurada' }, { status: 503 })
  }
  if (!process.env.VECTORS_DATABASE_URL) {
    return NextResponse.json({ error: 'VECTORS_DATABASE_URL não configurada' }, { status: 503 })
  }

  const chunks = chunkText(body.texto)
  if (!chunks.length) {
    return NextResponse.json({ ok: true, chunks: 0 })
  }

  const embeddings = await embedTexts(chunks)

  const rows: EmbeddingRow[] = chunks.map((conteudo, i) => ({
    clienteId: body.clienteId,
    leadId: body.leadId,
    documentoId: body.documentoId,
    tipo: body.tipo,
    titulo: body.titulo,
    conteudo,
    metadata: { ...body.metadata, chunkIndex: i, totalChunks: chunks.length },
  }))

  await storeEmbeddings(rows, embeddings)

  return NextResponse.json({ ok: true, chunks: chunks.length })
}
