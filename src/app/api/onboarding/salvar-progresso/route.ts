import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const body = await req.json()
  const { leadId, ...data } = body

  if (!leadId) {
    return NextResponse.json({ error: 'leadId obrigatório' }, { status: 400 })
  }

  // Merge dadosJson em vez de substituir — preserva dados de outros passos do wizard
  if (data.dadosJson) {
    const current = await prisma.lead.findUnique({ where: { id: leadId }, select: { dadosJson: true } })
    const currentJson = (current?.dadosJson as Record<string, unknown>) ?? {}
    data.dadosJson = { ...currentJson, ...(data.dadosJson as Record<string, unknown>) }
  }

  const lead = await prisma.lead.update({ where: { id: leadId }, data: data as any })

  import('@/lib/rag/ingest').then(({ indexarLead }) => indexarLead(lead)).catch(() => {})

  return NextResponse.json(lead)
}
