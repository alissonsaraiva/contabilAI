import { NextResponse } from 'next/server'
import { embedText, searchSimilar } from '@/lib/rag'
import type { SearchOpts } from '@/lib/rag'

export async function POST(req: Request) {
  const body = await req.json() as SearchOpts & { query: string }

  if (!body.query?.trim()) {
    return NextResponse.json({ error: 'query obrigatória' }, { status: 400 })
  }
  if (!process.env.VOYAGE_API_KEY) {
    return NextResponse.json({ error: 'VOYAGE_API_KEY não configurada' }, { status: 503 })
  }

  const embedding = await embedText(body.query)
  const results = await searchSimilar(embedding, {
    escopo: body.escopo,
    clienteId: body.clienteId,
    leadId: body.leadId,
    incluirGlobal: body.incluirGlobal,
    tipos: body.tipos,
    limit: body.limit,
    minSimilarity: body.minSimilarity,
  })

  return NextResponse.json({ results })
}
