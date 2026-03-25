import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const body = await req.json()
  const { leadId, ...data } = body

  if (!leadId) {
    return NextResponse.json({ error: 'leadId obrigatório' }, { status: 400 })
  }

  const lead = await prisma.lead.update({ where: { id: leadId }, data: data as any })

  import('@/lib/rag/ingest').then(({ indexarLead }) => indexarLead(lead)).catch(() => {})

  return NextResponse.json(lead)
}
