/**
 * PATCH /api/portal/financeiro/vencimento
 *
 * Permite que o próprio cliente altere o dia de vencimento da mensalidade.
 * Chama atualizarVencimentoAsaas (atualiza subscription + cobranças abertas + sync local).
 * body: { dia: number } — entre 1 e 28
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { atualizarVencimentoAsaas } from '@/lib/services/asaas-sync'

export async function PATCH(req: Request) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 400 })

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
    select: { asaasSubscriptionId: true, vencimentoDia: true },
  })
  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })

  // Sem alteração real — evita chamada desnecessária ao Asaas
  if (cliente.vencimentoDia === dia) {
    return NextResponse.json({ ok: true, asaas: false, proximoVencimento: null })
  }

  if (!cliente.asaasSubscriptionId) {
    // Sem Asaas: atualiza apenas localmente
    await prisma.cliente.update({ where: { id: clienteId }, data: { vencimentoDia: dia } })
    return NextResponse.json({ ok: true, asaas: false, proximoVencimento: null })
  }

  try {
    const { proximoVencimento } = await atualizarVencimentoAsaas(clienteId, dia)
    return NextResponse.json({ ok: true, asaas: true, proximoVencimento })
  } catch (err) {
    console.error(`[portal/vencimento] Erro ao atualizar vencimento para cliente ${clienteId}:`, err)
    Sentry.captureException(err, {
      tags:  { module: 'portal-api', operation: 'alterar-vencimento' },
      extra: { clienteId, dia },
    })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao atualizar vencimento.' },
      { status: 500 },
    )
  }
}
