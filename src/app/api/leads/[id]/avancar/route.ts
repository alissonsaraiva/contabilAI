import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import type { PlanoTipo, FormaPagamento, StatusLead } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json()

  const current = await prisma.lead.findUnique({ where: { id }, select: { stepAtual: true } })
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updateData: Record<string, unknown> = { stepAtual: current.stepAtual + 1 }

  if (body.status) updateData.status = body.status as StatusLead
  if (body.dadosJson) updateData.dadosJson = body.dadosJson
  if (body.planoTipo) updateData.planoTipo = body.planoTipo as PlanoTipo
  if (body.valorNegociado !== undefined) updateData.valorNegociado = body.valorNegociado
  if (body.vencimentoDia !== undefined) updateData.vencimentoDia = body.vencimentoDia
  if (body.formaPagamento) updateData.formaPagamento = body.formaPagamento as FormaPagamento

  const lead = await prisma.lead.update({ where: { id }, data: updateData as any })
  return NextResponse.json(lead)
}
