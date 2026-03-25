import { NextResponse } from 'next/server'
import { embedText, searchSimilar } from '@/lib/rag'

export async function POST(req: Request) {
  const { query, clienteId, leadId, limit } = await req.json() as {
    query: string
    clienteId?: string
    leadId?: string
    limit?: number
  }

  if (!query?.trim()) {
    return NextResponse.json({ error: 'query obrigatória' }, { status: 400 })
  }

  const embedding = await embedText(query)
  const results = await searchSimilar(embedding, { clienteId, leadId, limit })

  return NextResponse.json({ results })
}
