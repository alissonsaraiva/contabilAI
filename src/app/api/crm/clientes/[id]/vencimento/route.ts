/**
 * PATCH /api/crm/clientes/[id]/vencimento
 *
 * Altera o dia de vencimento da mensalidade.
 * Atualiza a subscription no Asaas (cobranças em aberto + futuras) e o banco local.
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { atualizarVencimentoAsaas } from '@/lib/services/asaas-sync'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: clienteId } = await params

  let body: { dia: number }
  try {
    body = await req.json() as { dia: number }
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  const dia = Number(body.dia)
  if (!dia || dia < 1 || dia > 28) {
    return NextResponse.json({ error: 'Dia inválido. Informe um valor entre 1 e 28.' }, { status: 400 })
  }

  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: { id: true, asaasSubscriptionId: true },
  })
  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })

  if (!cliente.asaasSubscriptionId) {
    // Sem Asaas: atualiza apenas localmente
    await prisma.cliente.update({ where: { id: clienteId }, data: { vencimentoDia: dia } })
    return NextResponse.json({ ok: true, asaas: false, proximoVencimento: null })
  }

  try {
    const { proximoVencimento } = await atualizarVencimentoAsaas(clienteId, dia)
    return NextResponse.json({ ok: true, asaas: true, proximoVencimento })
  } catch (err) {
    console.error(`[crm/vencimento] Erro ao atualizar vencimento no Asaas para cliente ${clienteId}:`, err)
    Sentry.captureException(err, {
      tags:  { module: 'crm-api', operation: 'atualizar-vencimento-asaas' },
      extra: { clienteId, dia },
    })
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao atualizar vencimento no Asaas.' }, { status: 500 })
  }
}
