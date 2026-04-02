/**
 * GET /api/portal/financeiro/cobranca-aberta
 *
 * Retorna a cobrança mais recente em aberto (PENDING ou OVERDUE) com todos os
 * dados de pagamento (PIX QR Code, copia e cola, link do boleto).
 *
 * GAP 4: inclui campo `pixExpirado` para o frontend saber quando exibir alerta
 * de QR Code vencido e oferecer botão de segunda via, em vez de mostrar código inválido.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'

// PIX do Asaas expira em 24h; usamos 20h como margem de segurança
const PIX_EXPIRACAO_MS = 20 * 60 * 60 * 1000

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

  // GAP 4: detecta PIX expirado para o frontend exibir alerta adequado
  // (em vez de mostrar silenciosamente um QR Code inválido ao cliente)
  const pixExpirado =
    cobranca.formaPagamento === 'pix' &&
    !!cobranca.pixCopiaECola &&
    !!cobranca.atualizadoEm &&
    Date.now() - new Date(cobranca.atualizadoEm).getTime() > PIX_EXPIRACAO_MS

  return NextResponse.json({
    ...cobranca,
    valor:       Number(cobranca.valor),
    pixExpirado,
    // Se PIX expirado, remove os dados de pagamento para evitar que o cliente copie código inválido
    pixQrCode:    pixExpirado ? null : cobranca.pixQrCode,
    pixCopiaECola: pixExpirado ? null : cobranca.pixCopiaECola,
  })
}
