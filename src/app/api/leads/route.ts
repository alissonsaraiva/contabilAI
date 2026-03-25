import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const createSchema = z.object({
  contatoEntrada: z.string().min(3),
  canal: z.enum(['site', 'whatsapp', 'indicacao', 'instagram', 'google', 'outro']).default('site'),
  funil: z.enum(['prospeccao', 'onboarding']).default('onboarding'),
  observacoes: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
})

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const page = Number(searchParams.get('page') ?? '1')
  const pageSize = Number(searchParams.get('pageSize') ?? '20')

  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { criadoEm: 'desc' },
      include: { responsavel: { select: { id: true, nome: true } } },
    }),
    prisma.lead.count(),
  ])

  return NextResponse.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
}

export async function POST(req: Request) {
  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Retoma lead existente no mesmo funil se o contato já existe
  const existing = await prisma.lead.findFirst({
    where: {
      contatoEntrada: parsed.data.contatoEntrada,
      funil: parsed.data.funil,
      status: { notIn: ['cancelado', 'expirado'] },
    },
    orderBy: { criadoEm: 'desc' },
  })

  if (existing) {
    return NextResponse.json({ ...existing, resumed: true }, { status: 200 })
  }

  const lead = await prisma.lead.create({ data: parsed.data })

  // Indexa o lead no RAG em background (não bloqueia a resposta)
  import('@/lib/rag/ingest').then(({ indexarLead }) => indexarLead(lead)).catch(() => {})

  return NextResponse.json({ ...lead, resumed: false }, { status: 201 })
}
