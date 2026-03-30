import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { chunkText, embedTexts, storeEmbeddings, listKnowledge } from '@/lib/rag'
import type { EmbeddingRow } from '@/lib/rag'
import type { TipoConhecimento, CanalRAG } from '@/lib/rag/types'
import { randomUUID } from 'crypto'

// GET — lista artigos da base global
export async function GET(req: Request) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const canal  = searchParams.get('canal') as CanalRAG | null
  const tipoFilter = searchParams.get('tipo') as TipoConhecimento | null

  try {
    const entries = await listKnowledge({
      canal:  canal  ?? undefined,
      tipo:   tipoFilter ?? undefined,
    })
    return NextResponse.json(entries)
  } catch (err) {
    console.error('[conhecimento] GET error:', err)
    return NextResponse.json({ error: 'Erro ao conectar ao banco de vetores. Verifique VECTORS_DATABASE_URL e rode a migration.' }, { status: 503 })
  }
}

// POST — cria artigo na base global
export async function POST(req: Request) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
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

  if (!process.env.VOYAGE_API_KEY) {
    return NextResponse.json({ error: 'VOYAGE_API_KEY não configurada' }, { status: 503 })
  }

  const chunks = chunkText(body.conteudo)
  if (!chunks.length) return NextResponse.json({ error: 'conteudo vazio após processamento' }, { status: 400 })

  const sourceId = randomUUID()

  try {
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
    console.error('[conhecimento] POST embed/store error:', err)
    return NextResponse.json(
      { error: err?.message ?? 'Erro ao gerar embeddings ou salvar no banco de vetores' },
      { status: 502 }
    )
  }

  return NextResponse.json({ ok: true, sourceId, chunks: chunks.length })
}
