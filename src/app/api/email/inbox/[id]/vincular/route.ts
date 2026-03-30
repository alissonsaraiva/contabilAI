import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { indexarAsync } from '@/lib/rag/indexar-async'

/** PATCH /api/email/inbox/[id]/vincular — vincula email não identificado a um cliente ou lead */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({})) as { clienteId?: string; leadId?: string }

  if (!body.clienteId && !body.leadId) {
    return NextResponse.json({ error: 'Informe clienteId ou leadId' }, { status: 400 })
  }

  const interacao = await prisma.interacao.findUnique({
    where: { id },
    select: { id: true, tipo: true, clienteId: true, leadId: true },
  })

  if (!interacao) return NextResponse.json({ error: 'E-mail não encontrado' }, { status: 404 })
  if (interacao.tipo !== 'email_recebido') {
    return NextResponse.json({ error: 'Operação disponível apenas para e-mails recebidos' }, { status: 400 })
  }
  if (interacao.clienteId || interacao.leadId) {
    return NextResponse.json({ error: 'E-mail já está vinculado a um cliente ou lead' }, { status: 409 })
  }

  // Verifica se o cliente/lead existe
  if (body.clienteId) {
    const cliente = await prisma.cliente.findUnique({
      where: { id: body.clienteId },
      select: { id: true, nome: true },
    })
    if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  const atualizado = await prisma.interacao.update({
    where: { id },
    data: {
      clienteId: body.clienteId ?? null,
      leadId:    body.leadId    ?? null,
    },
    select: {
      id: true,
      clienteId: true,
      leadId: true,
      cliente: { select: { nome: true } },
      lead:    { select: { contatoEntrada: true, dadosJson: true } },
    },
  })

  // Re-indexa no RAG com o contexto correto (canais crm + portal)
  indexarAsync('interacao', {
    id:        atualizado.id,
    clienteId: atualizado.clienteId ?? undefined,
    leadId:    atualizado.leadId    ?? undefined,
  })

  const clienteNome = atualizado.cliente?.nome
    ?? ((atualizado.lead?.dadosJson as any)?.nomeCompleto as string | undefined)
    ?? atualizado.lead?.contatoEntrada
    ?? null

  return NextResponse.json({ ok: true, clienteNome })
}
