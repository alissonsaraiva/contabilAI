/**
 * PATCH /api/crm/clientes/[id]/forma-pagamento
 *
 * Altera a forma de pagamento (apenas pix ou boleto).
 * Atualiza a subscription no Asaas e o banco local.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { alterarFormaPagamentoAsaas } from '@/lib/services/asaas-sync'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: clienteId } = await params

  let body: { forma: string }
  try {
    body = await req.json() as { forma: string }
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  if (body.forma !== 'pix' && body.forma !== 'boleto') {
    return NextResponse.json(
      { error: 'Forma de pagamento inválida. Use "pix" ou "boleto".' },
      { status: 400 },
    )
  }

  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: { id: true, asaasSubscriptionId: true },
  })
  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })

  if (!cliente.asaasSubscriptionId) {
    // Sem Asaas: atualiza apenas localmente
    await prisma.cliente.update({
      where: { id: clienteId },
      data:  { formaPagamento: body.forma as 'pix' | 'boleto' },
    })
    return NextResponse.json({ ok: true, asaas: false })
  }

  await alterarFormaPagamentoAsaas(clienteId, body.forma as 'pix' | 'boleto')

  return NextResponse.json({ ok: true, asaas: true })
}
