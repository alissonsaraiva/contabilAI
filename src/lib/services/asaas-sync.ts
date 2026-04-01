/**
 * Serviço de integração Asaas — provisionamento e sincronização.
 *
 * Funções exportadas:
 *   provisionarClienteAsaas  — cria customer + subscription após assinatura do contrato
 *   sincronizarCobrancas     — faz upsert das cobranças do Asaas no banco local
 *   atualizarVencimentoAsaas — altera dia de vencimento na subscription + banco
 *   alterarFormaPagamento    — altera billingType na subscription + banco
 *   suspenderAsaas           — cancela subscription no Asaas
 *   reativarAsaas            — cria nova subscription (após reativação)
 */
import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import {
  asaasCreateCustomer,
  asaasCreateSubscription,
  asaasUpdateSubscription,
  asaasCancelSubscription,
  asaasListPayments,
  asaasGetPixQrCode,
  asaasGetBoletoBarcode,
  calcularProximoVencimento,
  toBillingType,
  toAsaasDate,
} from '@/lib/asaas'
import type { AsaasPayment } from '@/lib/asaas'
import type { AsaasStatusCobranca, FormaPagamento } from '@prisma/client'

// ─── Mapeamento de status ─────────────────────────────────────────────────────

function mapStatus(asaasStatus: string): AsaasStatusCobranca {
  switch (asaasStatus) {
    case 'PENDING':
    case 'CONFIRMED':
    case 'AWAITING_RISK_ANALYSIS':
      return 'PENDING'
    case 'RECEIVED':
    case 'RECEIVED_IN_CASH':
      return 'RECEIVED'
    case 'OVERDUE':
    case 'DUNNING_REQUESTED':
    case 'DUNNING_RECEIVED':
      return 'OVERDUE'
    case 'REFUNDED':
    case 'REFUND_REQUESTED':
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
    case 'AWAITING_CHARGEBACK_REVERSAL':
      return 'REFUNDED'
    default:
      return 'CANCELLED'
  }
}

// ─── Sync de detalhes de pagamento (pix/boleto) ───────────────────────────────

async function enriquecerPagamento(
  payment: AsaasPayment,
  forma: FormaPagamento,
): Promise<{
  linkBoleto?: string | null
  codigoBarras?: string | null
  pixQrCode?: string | null
  pixCopiaECola?: string | null
}> {
  // Só busca detalhes se a cobrança está em aberto
  if (!['PENDING', 'OVERDUE'].includes(payment.status)) return {}

  try {
    if (forma === 'pix') {
      const qr = await asaasGetPixQrCode(payment.id)
      return {
        pixQrCode:    qr.encodedImage,
        pixCopiaECola: qr.payload,
      }
    }
    if (forma === 'boleto') {
      const barcode = await asaasGetBoletoBarcode(payment.id)
      return {
        linkBoleto:  payment.bankSlipUrl ?? payment.invoiceUrl ?? null,
        codigoBarras: barcode.identificationField,
      }
    }
  } catch (err) {
    console.error(`[asaas-sync] Erro ao enriquecer pagamento ${payment.id}:`, err)
    Sentry.captureException(err, { tags: { module: 'asaas-sync', operation: 'enriquecer-pagamento' }, extra: { paymentId: payment.id } })
  }
  return {}
}

// ─── Sincronizar cobranças ────────────────────────────────────────────────────

export async function sincronizarCobrancas(
  clienteId: string,
  subscriptionId: string,
  forma: FormaPagamento,
): Promise<void> {
  let offset = 0
  const limit = 24

  while (true) {
    const lista = await asaasListPayments({ subscriptionId, limit, offset })

    for (const payment of lista.data) {
      const status = mapStatus(payment.status)
      const detalhes = await enriquecerPagamento(payment, forma)

      const pagoEm = payment.paymentDate ? new Date(payment.paymentDate) : null

      await prisma.cobrancaAsaas.upsert({
        where:  { asaasId: payment.id },
        create: {
          asaasId:        payment.id,
          clienteId,
          valor:          payment.value,
          vencimento:     new Date(payment.dueDate),
          status,
          formaPagamento: forma,
          pagoEm,
          valorPago:      pagoEm ? payment.netValue ?? payment.value : null,
          ...detalhes,
        },
        update: {
          status,
          vencimento:    new Date(payment.dueDate),
          pagoEm,
          valorPago:     pagoEm ? payment.netValue ?? payment.value : null,
          atualizadoEm:  new Date(),
          ...detalhes,
        },
      })
    }

    if (!lista.hasMore) break
    offset += limit
  }

  await prisma.cliente.update({
    where: { id: clienteId },
    data:  { asaasUltimoSync: new Date() },
  })
}

// ─── Provisionar cliente no Asaas ────────────────────────────────────────────

export async function provisionarClienteAsaas(clienteId: string): Promise<void> {
  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: {
      id: true, nome: true, cpf: true, email: true, whatsapp: true,
      valorMensal: true, vencimentoDia: true, formaPagamento: true,
      planoTipo: true,
      asaasCustomerId: true,     // evita criar duplicado se já existe
      asaasSubscriptionId: true,
      empresa: { select: { cnpj: true, razaoSocial: true } },
    },
  })

  if (!cliente) throw new Error(`[asaas-sync] Cliente ${clienteId} não encontrado.`)

  // Idempotente: se já tem customer e subscription, só sincroniza cobranças
  if (cliente.asaasCustomerId && cliente.asaasSubscriptionId) {
    await sincronizarCobrancas(clienteId, cliente.asaasSubscriptionId, cliente.formaPagamento)
    return
  }

  const billingType = toBillingType(cliente.formaPagamento)
  const nextDueDate = calcularProximoVencimento(cliente.vencimentoDia)
  const valor = Number(cliente.valorMensal)

  // 1. Criar customer
  let customerId = cliente.asaasCustomerId
  if (!customerId) {
    const customer = await asaasCreateCustomer({
      name:        cliente.empresa?.razaoSocial ?? cliente.nome,
      cpfCnpj:     (cliente.empresa?.cnpj ?? cliente.cpf ?? '').replace(/\D/g, ''),
      email:       cliente.email,
      mobilePhone: cliente.whatsapp,
    })
    customerId = customer.id
    await prisma.cliente.update({
      where: { id: clienteId },
      data:  { asaasCustomerId: customerId, asaasStatus: 'ACTIVE' },
    })
  }

  // 2. Criar subscription
  const subscription = await asaasCreateSubscription({
    customerId,
    billingType,
    value:       valor,
    nextDueDate,
    description: `Mensalidade - Plano ${cliente.planoTipo}`,
  })

  await prisma.cliente.update({
    where: { id: clienteId },
    data: {
      asaasSubscriptionId: subscription.id,
      asaasStatus:         'ACTIVE',
    },
  })

  // 3. Sync inicial das cobranças (a subscription já gera a primeira)
  await sincronizarCobrancas(clienteId, subscription.id, cliente.formaPagamento)

  console.log(`[asaas-sync] Cliente ${clienteId} provisionado — customer: ${customerId}, subscription: ${subscription.id}`)
}

// ─── Alterar vencimento ───────────────────────────────────────────────────────

export async function atualizarVencimentoAsaas(
  clienteId: string,
  novoDia: number,
): Promise<{ proximoVencimento: string }> {
  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: { asaasSubscriptionId: true, formaPagamento: true, vencimentoDia: true },
  })

  if (!cliente?.asaasSubscriptionId) {
    throw new Error('[asaas-sync] Cliente sem subscription Asaas. Provisione primeiro.')
  }

  const proximoVencimento = calcularProximoVencimento(novoDia)

  // Atualiza no Asaas — updatePendingPayments: true para cobranças em aberto
  await asaasUpdateSubscription(cliente.asaasSubscriptionId, {
    nextDueDate:          proximoVencimento,
    updatePendingPayments: true,
  })

  // Atualiza localmente
  await prisma.cliente.update({
    where: { id: clienteId },
    data:  { vencimentoDia: novoDia },
  })

  // Re-sincroniza cobranças para refletir nova data
  await sincronizarCobrancas(clienteId, cliente.asaasSubscriptionId, cliente.formaPagamento)

  return { proximoVencimento }
}

// ─── Alterar forma de pagamento ───────────────────────────────────────────────

export async function alterarFormaPagamentoAsaas(
  clienteId: string,
  novaForma: 'pix' | 'boleto',
): Promise<void> {
  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: { asaasSubscriptionId: true, vencimentoDia: true },
  })

  if (!cliente?.asaasSubscriptionId) {
    throw new Error('[asaas-sync] Cliente sem subscription Asaas.')
  }

  const billingType = toBillingType(novaForma)

  await asaasUpdateSubscription(cliente.asaasSubscriptionId, {
    billingType,
    updatePendingPayments: true,
  })

  await prisma.cliente.update({
    where: { id: clienteId },
    data:  { formaPagamento: novaForma as FormaPagamento },
  })

  await sincronizarCobrancas(clienteId, cliente.asaasSubscriptionId, novaForma as FormaPagamento)
}

// ─── Suspender / cancelar ─────────────────────────────────────────────────────

export async function suspenderAsaas(clienteId: string): Promise<void> {
  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: { asaasSubscriptionId: true },
  })

  if (!cliente?.asaasSubscriptionId) return  // sem subscription, nada a fazer

  try {
    await asaasCancelSubscription(cliente.asaasSubscriptionId)
    await prisma.cliente.update({
      where: { id: clienteId },
      data:  { asaasSubscriptionId: null, asaasStatus: 'INACTIVE' },
    })
  } catch (err) {
    console.error(`[asaas-sync] Erro ao suspender subscription do cliente ${clienteId}:`, err)
    Sentry.captureException(err, { tags: { module: 'asaas-sync', operation: 'suspender-subscription' }, extra: { clienteId } })
  }
}

// ─── Reativar ─────────────────────────────────────────────────────────────────

export async function reativarAsaas(clienteId: string): Promise<void> {
  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: {
      asaasCustomerId: true,
      valorMensal: true,
      vencimentoDia: true,
      formaPagamento: true,
      planoTipo: true,
    },
  })

  if (!cliente?.asaasCustomerId) {
    // Nunca foi provisionado — provisiona do zero
    await provisionarClienteAsaas(clienteId)
    return
  }

  // Já tem customer, só recria a subscription
  const billingType   = toBillingType(cliente.formaPagamento)
  const nextDueDate   = calcularProximoVencimento(cliente.vencimentoDia)
  const valor         = Number(cliente.valorMensal)

  const subscription = await asaasCreateSubscription({
    customerId:  cliente.asaasCustomerId,
    billingType,
    value:       valor,
    nextDueDate,
    description: `Mensalidade - Plano ${cliente.planoTipo} (reativação)`,
  })

  await prisma.cliente.update({
    where: { id: clienteId },
    data: {
      asaasSubscriptionId: subscription.id,
      asaasStatus:         'ACTIVE',
    },
  })

  await sincronizarCobrancas(clienteId, subscription.id, cliente.formaPagamento)
}

// ─── Segunda via ──────────────────────────────────────────────────────────────

export async function gerarSegundaVia(cobrancaId: string): Promise<{
  linkBoleto?: string | null
  codigoBarras?: string | null
  pixQrCode?: string | null
  pixCopiaECola?: string | null
  novaCobrancaId: string
}> {
  const cobranca = await prisma.cobrancaAsaas.findUnique({
    where:   { id: cobrancaId },
    include: { cliente: { select: { asaasCustomerId: true } } },
  })

  if (!cobranca) throw new Error('[asaas-sync] Cobrança não encontrada.')
  if (!cobranca.cliente.asaasCustomerId) throw new Error('[asaas-sync] Cliente sem customer Asaas.')

  const { asaasCreatePayment, asaasGetPixQrCode: getPixQr, asaasGetBoletoBarcode: getBarcode } = await import('@/lib/asaas')

  // Nova cobrança com vencimento em 3 dias úteis
  const novaData = new Date()
  novaData.setDate(novaData.getDate() + 3)
  const dueDate = toAsaasDate(novaData)

  const novoPagamento = await asaasCreatePayment({
    customerId:  cobranca.cliente.asaasCustomerId,
    billingType: toBillingType(cobranca.formaPagamento),
    value:       Number(cobranca.valor),
    dueDate,
    description: `Segunda via — vencimento original: ${cobranca.vencimento.toLocaleDateString('pt-BR')}`,
  })

  // Busca detalhes da nova cobrança
  let detalhes: {
    linkBoleto?: string | null
    codigoBarras?: string | null
    pixQrCode?: string | null
    pixCopiaECola?: string | null
  } = {}

  try {
    if (cobranca.formaPagamento === 'pix') {
      const qr = await getPixQr(novoPagamento.id)
      detalhes = { pixQrCode: qr.encodedImage, pixCopiaECola: qr.payload }
    } else {
      const barcode = await getBarcode(novoPagamento.id)
      detalhes = {
        linkBoleto:   novoPagamento.bankSlipUrl ?? novoPagamento.invoiceUrl ?? null,
        codigoBarras: barcode.identificationField,
      }
    }
  } catch (err) {
    console.error('[asaas-sync] Erro ao buscar detalhes da segunda via:', err)
    Sentry.captureException(err, { tags: { module: 'asaas-sync', operation: 'detalhes-segunda-via' }, extra: { cobrancaId: cobranca.id } })
  }

  // Salva nova cobrança no banco
  const nova = await prisma.cobrancaAsaas.create({
    data: {
      asaasId:        novoPagamento.id,
      clienteId:      cobranca.clienteId,
      valor:          novoPagamento.value,
      vencimento:     novaData,
      status:         'PENDING',
      formaPagamento: cobranca.formaPagamento,
      ...detalhes,
    },
  })

  return { ...detalhes, novaCobrancaId: nova.id }
}
