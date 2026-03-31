/**
 * GET /api/portal/financeiro/cobrancas
 *
 * Retorna as últimas 12 cobranças do cliente logado.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'

export async function GET() {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 400 })

  const cobrancas = await prisma.cobrancaAsaas.findMany({
    where:   { clienteId },
    orderBy: { vencimento: 'desc' },
    take:    12,
    select: {
      id: true,
      valor: true,
      vencimento: true,
      status: true,
      formaPagamento: true,
      // Dados sensíveis de pagamento omitidos — disponíveis via /cobranca-aberta
      pagoEm: true,
      valorPago: true,
    },
  })

  return NextResponse.json(
    cobrancas.map(c => ({
      ...c,
      valor:    Number(c.valor),
      valorPago: c.valorPago != null ? Number(c.valorPago) : null,
    })),
  )
}
