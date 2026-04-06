/**
 * PATCH /api/crm/clientes/[id]/mensalidade
 *
 * Altera o valor da mensalidade individual de um cliente.
 * Se o cliente tiver subscription no Asaas, propaga a alteração lá também
 * (incluindo cobranças em aberto via updatePendingPayments: true).
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { atualizarValorMensalidadeAsaas } from '@/lib/services/asaas-sync'
import { indexarAsync } from '@/lib/rag/indexar-async'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: clienteId } = await params

  let body: { valor: number }
  try {
    body = await req.json() as { valor: number }
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  const valor = Number(body.valor)
  if (!valor || isNaN(valor) || valor <= 0) {
    return NextResponse.json({ error: 'Valor inválido. Informe um valor maior que zero.' }, { status: 400 })
  }
  // Limita a 2 casas decimais
  const valorFinal = Math.round(valor * 100) / 100

  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: { id: true, asaasSubscriptionId: true },
  })
  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })

  try {
    const { asaas } = await atualizarValorMensalidadeAsaas(clienteId, valorFinal)

    // Atualiza o RAG com o novo valor da mensalidade (fire-and-forget)
    const clienteAtualizado = await prisma.cliente.findUnique({ where: { id: clienteId } })
    if (clienteAtualizado) indexarAsync('cliente', clienteAtualizado)

    return NextResponse.json({ ok: true, asaas, novoValor: valorFinal })
  } catch (err) {
    console.error(`[crm/mensalidade] Erro ao atualizar mensalidade do cliente ${clienteId}:`, err)
    Sentry.captureException(err, {
      tags:  { module: 'crm-api', operation: 'atualizar-mensalidade' },
      extra: { clienteId, valorFinal },
    })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao atualizar mensalidade.' },
      { status: 500 },
    )
  }
}
