import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { chunkText, embedTexts, storeEmbeddings } from '@/lib/rag'
import type { EmbeddingRow } from '@/lib/rag'
import type { TipoConhecimento, CanalRAG } from '@/lib/rag/types'
import { randomUUID } from 'crypto'
import pdfParse from 'pdf-parse'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (!process.env.VOYAGE_API_KEY) {
    return NextResponse.json({ error: 'VOYAGE_API_KEY não configurada' }, { status: 503 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Arquivo inválido ou formulário malformado' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const titulo = (formData.get('titulo') as string | null)?.trim()
  const canal = formData.get('canal') as CanalRAG | null
  const tipoConhecimento = formData.get('tipo') as TipoConhecimento | null

  if (!file) return NextResponse.json({ error: 'file obrigatório' }, { status: 400 })
  if (!titulo) return NextResponse.json({ error: 'titulo obrigatório' }, { status: 400 })
  if (!canal) return NextResponse.json({ error: 'canal obrigatório' }, { status: 400 })
  if (!tipoConhecimento) return NextResponse.json({ error: 'tipo obrigatório' }, { status: 400 })

  let buffer: Buffer
  try {
    buffer = Buffer.from(await file.arrayBuffer())
  } catch {
    return NextResponse.json({ error: 'Não foi possível ler o arquivo' }, { status: 400 })
  }

  let parsed: Awaited<ReturnType<typeof pdfParse>>
  try {
    parsed = await pdfParse(buffer)
  } catch {
    return NextResponse.json({ error: 'Não foi possível processar o PDF' }, { status: 422 })
  }

  const texto = parsed.text?.trim()
  if (!texto) return NextResponse.json({ error: 'PDF sem conteúdo textual' }, { status: 422 })

  const chunks = chunkText(texto)
  if (!chunks.length) return NextResponse.json({ error: 'Conteúdo vazio após processamento' }, { status: 400 })

  const sourceId = randomUUID()
  const embeddings = await embedTexts(chunks)

  const rows: EmbeddingRow[] = chunks.map((conteudo, i) => ({
    escopo: 'global' as const,
    canal,
    tipo: tipoConhecimento,
    titulo,
    conteudo,
    metadata: {
      sourceId,
      chunkIndex: i,
      totalChunks: chunks.length,
      originalFilename: file.name,
      pages: parsed.numpages,
    },
  }))

  await storeEmbeddings(rows, embeddings)

  return NextResponse.json({
    ok: true,
    sourceId,
    chunks: chunks.length,
    pages: parsed.numpages,
    chars: parsed.text.length,
  })
}
