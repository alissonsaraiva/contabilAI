/**
 * GET  /api/crm/clientes/[id]/cobrancas  — lista cobranças do cliente
 * POST /api/crm/clientes/[id]/cobrancas  — força sincronização com Asaas
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sincronizarCobrancas } from '@/lib/services/asaas-sync'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: clienteId } = await params

  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: {
      id: true,
      valorMensal: true,
      vencimentoDia: true,
      formaPagamento: true,
      asaasCustomerId: true,
      asaasSubscriptionId: true,
      asaasStatus: true,
      asaasUltimoSync: true,
    },
  })
  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const cobrancas = await prisma.cobrancaAsaas.findMany({
    where:   { clienteId },
    orderBy: { vencimento: 'desc' },
    take:    24,
    select: {
      id: true, asaasId: true, valor: true, vencimento: true,
      status: true, formaPagamento: true,
      linkBoleto: true, codigoBarras: true,
      pixQrCode: true, pixCopiaECola: true,
      pagoEm: true, valorPago: true,
      criadoEm: true,
    },
  })

  // Resumo financeiro
  const emAberto = cobrancas
    .filter(c => c.status === 'PENDING' || c.status === 'OVERDUE')
    .reduce((acc, c) => acc + Number(c.valor), 0)

  const emAtraso = cobrancas
    .filter(c => c.status === 'OVERDUE')
    .reduce((acc, c) => acc + Number(c.valor), 0)

  return NextResponse.json({
    asaasConfigurado: !!(cliente.asaasCustomerId && cliente.asaasSubscriptionId),
    asaasStatus:      cliente.asaasStatus,
    asaasUltimoSync:  cliente.asaasUltimoSync,
    resumo: { emAberto, emAtraso },
    cobrancas: cobrancas.map(c => ({
      ...c,
      valor:    Number(c.valor),
      valorPago: c.valorPago != null ? Number(c.valorPago) : null,
    })),
  })
}

export async function POST(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: clienteId } = await params

  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: { asaasSubscriptionId: true, formaPagamento: true },
  })

  if (!cliente?.asaasSubscriptionId) {
    return NextResponse.json({ error: 'Cliente não possui subscription Asaas.' }, { status: 400 })
  }

  await sincronizarCobrancas(clienteId, cliente.asaasSubscriptionId, cliente.formaPagamento)

  return NextResponse.json({ ok: true })
}
