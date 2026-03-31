/**
 * GET /api/portal/financeiro/cobranca-aberta
 *
 * Retorna a cobrança mais recente em aberto (PENDING ou OVERDUE) com todos os
 * dados de pagamento (PIX QR Code, copia e cola, link do boleto).
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

  const cobranca = await prisma.cobrancaAsaas.findFirst({
    where: {
      clienteId,
      status: { in: ['PENDING', 'OVERDUE'] },
    },
    orderBy: { vencimento: 'asc' },   // a mais antiga em aberto primeiro
    select: {
      id: true,
      valor: true,
      vencimento: true,
      status: true,
      formaPagamento: true,
      linkBoleto: true,
      codigoBarras: true,
      pixQrCode: true,
      pixCopiaECola: true,
      atualizadoEm: true,
    },
  })

  if (!cobranca) return NextResponse.json(null)

  return NextResponse.json({
    ...cobranca,
    valor: Number(cobranca.valor),
  })
}
