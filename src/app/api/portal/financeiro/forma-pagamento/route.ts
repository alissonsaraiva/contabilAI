/**
 * PATCH /api/portal/financeiro/forma-pagamento
 *
 * Permite que o próprio cliente altere a forma de pagamento (pix ↔ boleto).
 * Chama alterarFormaPagamentoAsaas (atualiza subscription + cobranças abertas + sync local).
 * body: { forma: 'pix' | 'boleto' }
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { alterarFormaPagamentoAsaas } from '@/lib/services/asaas-sync'

export async function PATCH(req: Request) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 400 })

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
    select: { asaasSubscriptionId: true, formaPagamento: true },
  })
  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })

  if (cliente.formaPagamento === body.forma) {
    return NextResponse.json({ ok: true, asaas: false, mensagem: 'Forma de pagamento já está configurada.' })
  }

  if (!cliente.asaasSubscriptionId) {
    // Sem Asaas: atualiza apenas localmente
    await prisma.cliente.update({
      where: { id: clienteId },
      data:  { formaPagamento: body.forma as 'pix' | 'boleto' },
    })
    return NextResponse.json({ ok: true, asaas: false })
  }

  try {
    await alterarFormaPagamentoAsaas(clienteId, body.forma as 'pix' | 'boleto')
    return NextResponse.json({ ok: true, asaas: true })
  } catch (err) {
    console.error(`[portal/forma-pagamento] Erro ao alterar forma de pagamento para cliente ${clienteId}:`, err)
    Sentry.captureException(err, {
      tags:  { module: 'portal-api', operation: 'alterar-forma-pagamento' },
      extra: { clienteId, forma: body.forma },
    })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao alterar forma de pagamento.' },
      { status: 500 },
    )
  }
}
