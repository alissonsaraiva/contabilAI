/**
 * GET /api/portal/financeiro/extrato
 *
 * Retorna todas as cobranças do cliente em formato CSV (ponto-e-vírgula, UTF-8).
 * Usado para o cliente gerar o próprio extrato financeiro sem precisar do escritório.
 *
 * Resposta: Content-Disposition: attachment; filename="extrato-financeiro.csv"
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'

const STATUS_PT: Record<string, string> = {
  PENDING:   'Em aberto',
  RECEIVED:  'Pago',
  OVERDUE:   'Vencido',
  REFUNDED:  'Reembolsado',
  CANCELLED: 'Cancelado',
}

const FORMA_PT: Record<string, string> = {
  pix:    'PIX',
  boleto: 'Boleto',
}

export async function GET() {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 400 })

  const cobrancas = await prisma.cobrancaAsaas.findMany({
    where:   { clienteId, status: { notIn: ['CANCELLED'] } },
    orderBy: [{ vencimento: 'desc' }, { criadoEm: 'desc' }],
    select: {
      valor:          true,
      vencimento:     true,
      status:         true,
      formaPagamento: true,
      pagoEm:         true,
      valorPago:      true,
      invoiceUrl:     true,
    },
  })

  const header = 'Vencimento;Valor (R$);Status;Forma de Pagamento;Data de Pagamento;Valor Pago (R$);Comprovante'

  const rows = cobrancas.map(c => [
    new Date(c.vencimento).toLocaleDateString('pt-BR'),
    Number(c.valor).toFixed(2).replace('.', ','),
    STATUS_PT[c.status]         ?? c.status,
    FORMA_PT[c.formaPagamento]  ?? c.formaPagamento,
    c.pagoEm   ? new Date(c.pagoEm).toLocaleDateString('pt-BR')                 : '',
    c.valorPago ? Number(c.valorPago).toFixed(2).replace('.', ',') : '',
    c.invoiceUrl ?? '',
  ].join(';'))

  // BOM UTF-8 para compatibilidade com Excel
  const csv = '\uFEFF' + [header, ...rows].join('\r\n')

  return new Response(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="extrato-financeiro.csv"',
    },
  })
}
