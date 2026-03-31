import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { deleteBySourceId, chunkText, embedTexts, storeEmbeddings } from '@/lib/rag'
import type { EmbeddingRow } from '@/lib/rag'
import type { TipoConhecimento, CanalRAG } from '@/lib/rag/types'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { sourceId } = await params
  if (!sourceId) return NextResponse.json({ error: 'sourceId obrigatório' }, { status: 400 })

  await deleteBySourceId(sourceId)
  return NextResponse.json({ ok: true })
}

// PUT — atualiza artigo: apaga chunks antigos e re-indexa
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { sourceId } = await params
  if (!sourceId) return NextResponse.json({ error: 'sourceId obrigatório' }, { status: 400 })

  if (!process.env.VOYAGE_API_KEY) {
    return NextResponse.json({ error: 'VOYAGE_API_KEY não configurada' }, { status: 503 })
  }

  const body = await req.json() as {
    titulo: string
    conteudo: string
    tipo: TipoConhecimento
    canal: CanalRAG
  }

  if (!body.titulo?.trim()) return NextResponse.json({ error: 'titulo obrigatório' }, { status: 400 })
  if (!body.conteudo?.trim()) return NextResponse.json({ error: 'conteudo obrigatório' }, { status: 400 })
  if (!body.tipo) return NextResponse.json({ error: 'tipo obrigatório' }, { status: 400 })
  if (!body.canal) return NextResponse.json({ error: 'canal obrigatório' }, { status: 400 })

  const chunks = chunkText(body.conteudo)
  if (!chunks.length) return NextResponse.json({ error: 'conteudo vazio após processamento' }, { status: 400 })

  try {
    await deleteBySourceId(sourceId)

    const embeddings = await embedTexts(chunks)

    const rows: EmbeddingRow[] = chunks.map((conteudo, i) => ({
      escopo: 'global' as const,
      canal: body.canal,
      tipo: body.tipo,
      titulo: body.titulo,
      conteudo,
      metadata: { sourceId, chunkIndex: i, totalChunks: chunks.length },
    }))

    await storeEmbeddings(rows, embeddings)
  } catch (err: any) {
    console.error('[conhecimento] PUT embed/store error:', err)
    return NextResponse.json(
      { error: err?.message ?? 'Erro ao atualizar embeddings' },
      { status: 502 }
    )
  }

  return NextResponse.json({ ok: true, sourceId, chunks: chunks.length })
}
