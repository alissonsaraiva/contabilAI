/**
 * POST /api/crm/clientes/[id]/provisionar
 *
 * GAP 5: provisiona (ou re-provisiona) manualmente o cliente no Asaas.
 * Útil quando o provisionamento automático falhou (CNPJ inválido, API key errada,
 * timeout, etc.) e o operador precisa acionar o fluxo novamente via CRM.
 *
 * Idempotente: se o cliente já possui customer + subscription, apenas sincroniza
 * as cobranças (sem criar duplicatas no Asaas).
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { provisionarClienteAsaas } from '@/lib/services/asaas-sync'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: clienteId } = await params

  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: { id: true, nome: true, asaasCustomerId: true, asaasSubscriptionId: true },
  })

  if (!cliente) {
    return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
  }

  try {
    await provisionarClienteAsaas(clienteId)

    // Busca estado atualizado após provisionamento
    const atualizado = await prisma.cliente.findUnique({
      where:  { id: clienteId },
      select: { asaasCustomerId: true, asaasSubscriptionId: true, asaasStatus: true, asaasUltimoSync: true },
    })

    return NextResponse.json({
      ok:       true,
      mensagem: cliente.asaasCustomerId && cliente.asaasSubscriptionId
        ? 'Cobranças sincronizadas com sucesso.'
        : 'Cliente provisionado no Asaas com sucesso.',
      asaas: atualizado,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[crm/provisionar] Erro ao provisionar cliente ${clienteId}:`, err)
    Sentry.captureException(err, {
      tags:  { module: 'crm-api', operation: 'provisionar-cliente' },
      extra: { clienteId },
    })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
