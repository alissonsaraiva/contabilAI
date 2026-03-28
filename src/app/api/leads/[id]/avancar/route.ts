import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { indexarAsync } from '@/lib/rag/indexar-async'

const avancarSchema = z.object({
  status:         z.enum(['iniciado','simulador','plano_escolhido','dados_preenchidos','revisao','contrato_gerado','aguardando_assinatura','assinado','expirado','cancelado']).optional(),
  dadosJson:      z.record(z.string(), z.unknown()).optional().nullable(),
  planoTipo:      z.enum(['essencial', 'profissional', 'empresarial', 'startup']).optional(),
  valorNegociado: z.number().positive().optional().nullable(),
  vencimentoDia:  z.number().int().min(1).max(31).optional().nullable(),
  formaPagamento: z.enum(['pix', 'boleto', 'cartao']).optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json()
  const parsed = avancarSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const current = await prisma.lead.findUnique({ where: { id }, select: { stepAtual: true } })
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updateData: Record<string, unknown> = { stepAtual: current.stepAtual + 1 }
  const { status, dadosJson, planoTipo, valorNegociado, vencimentoDia, formaPagamento } = parsed.data

  if (status)                    updateData.status         = status
  if (dadosJson !== undefined)   updateData.dadosJson      = dadosJson
  if (planoTipo)                 updateData.planoTipo      = planoTipo
  if (valorNegociado !== undefined) updateData.valorNegociado = valorNegociado
  if (vencimentoDia !== undefined)  updateData.vencimentoDia  = vencimentoDia
  if (formaPagamento)            updateData.formaPagamento = formaPagamento

  const lead = await prisma.lead.update({ where: { id }, data: updateData as any })

  if (dadosJson) {
    indexarAsync('lead', lead)
  }

  return NextResponse.json(lead)
}
