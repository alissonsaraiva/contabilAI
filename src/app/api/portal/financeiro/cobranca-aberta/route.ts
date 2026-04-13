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
import { refresharPixCobranca } from '@/lib/services/asaas-sync'

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
      pixGeradoEm: true,
      atualizadoEm: true,
    },
  })

  if (!cobranca) return NextResponse.json(null)

  // Usa pixGeradoEm (setado apenas quando o QR Code chega do Asaas) para calcular
  // expiração com precisão. atualizadoEm é resetado por qualquer webhook — não é confiável.
  const pixBaseTime = cobranca.pixGeradoEm ?? cobranca.atualizadoEm
  const pixExpirado =
    cobranca.formaPagamento === 'pix' &&
    !!cobranca.pixCopiaECola &&
    !!pixBaseTime &&
    Date.now() - new Date(pixBaseTime).getTime() > PIX_EXPIRACAO_MS

  // PENDING + PIX expirado → renova o QR code via Asaas sem cancelar a cobrança.
  // Best-effort: se falhar, mantém pixExpirado=true e o cliente vê o aviso normal.
  let pixQrCodeFinal    = pixExpirado ? null : cobranca.pixQrCode
  let pixCopiaEColaFinal = pixExpirado ? null : cobranca.pixCopiaECola
  let pixExpiradoFinal   = pixExpirado

  if (pixExpirado && cobranca.status === 'PENDING') {
    const refreshed = await refresharPixCobranca(cobranca.id).catch(err => { console.error('[portal/cobranca-aberta] falha ao renovar PIX:', err); return null })
    if (refreshed) {
      pixQrCodeFinal     = refreshed.pixQrCode
      pixCopiaEColaFinal = refreshed.pixCopiaECola
      pixExpiradoFinal   = false
    }
  }

  return NextResponse.json({
    ...cobranca,
    valor:         Number(cobranca.valor),
    pixExpirado:   pixExpiradoFinal,
    pixQrCode:     pixQrCodeFinal,
    pixCopiaECola: pixCopiaEColaFinal,
  })
}
