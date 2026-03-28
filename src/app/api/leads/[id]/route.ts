import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { indexarAsync } from '@/lib/rag/indexar-async'

const updateSchema = z.object({
  responsavelId:  z.string().uuid().optional().nullable(),
  observacoes:    z.string().optional().nullable(),
  planoTipo:      z.enum(['essencial', 'profissional', 'empresarial', 'startup']).optional(),
  valorNegociado: z.number().positive().optional().nullable(),
  vencimentoDia:  z.number().int().min(1).max(31).optional().nullable(),
  formaPagamento: z.enum(['pix', 'boleto', 'cartao']).optional().nullable(),
  funil:          z.string().optional(),
  status:         z.enum(['iniciado','simulador','plano_escolhido','dados_preenchidos','revisao','contrato_gerado','aguardando_assinatura','assinado','expirado','cancelado']).optional(),
  dadosJson:      z.record(z.string(), z.unknown()).optional().nullable(),
}).strict()

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      responsavel: { select: { id: true, nome: true } },
      contrato: true,
      documentos: true,
      interacoes: { orderBy: { criadoEm: 'desc' } },
    },
  })
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(lead)
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const lead = await prisma.lead.update({ where: { id }, data: parsed.data as any })

  indexarAsync('lead', lead)

  return NextResponse.json(lead)
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await prisma.lead.update({ where: { id }, data: { status: 'cancelado' } })

  // Lead cancelado não deve permanecer indexado no RAG
  import('@/lib/rag/store').then(({ deleteEmbeddings }) =>
    deleteEmbeddings({ leadId: id })
  ).catch(() => {})

  return NextResponse.json({ ok: true })
}
