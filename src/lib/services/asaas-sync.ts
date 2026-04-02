/**
 * Serviço de integração Asaas — provisionamento e sincronização.
 *
 * Funções exportadas:
 *   provisionarClienteAsaas  — cria customer + subscription após assinatura do contrato
 *   sincronizarCobrancas     — faz upsert das cobranças do Asaas no banco local
 *   atualizarVencimentoAsaas — altera dia de vencimento na subscription + banco
 *   alterarFormaPagamento    — altera billingType na subscription + banco
 *   suspenderAsaas           — cancela subscription no Asaas + cancela cobranças locais abertas
 *   reativarAsaas            — cria nova subscription (após reativação)
 *   gerarSegundaVia          — cria nova cobrança avulsa e cancela a original localmente
 */
import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import {
  asaasCreateCustomer,
  asaasCreateSubscription,
  asaasUpdateSubscription,
  asaasCancelSubscription,
  asaasListPayments,
  asaasCreatePayment,
  asaasGetPixQrCode,
  asaasGetBoletoBarcode,
  calcularProximoVencimento,
  mapAsaasStatus,
  toBillingType,
  toAsaasDate,
} from '@/lib/asaas'
import type { AsaasPayment } from '@/lib/asaas'
import type { FormaPagamento } from '@prisma/client'

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
        linkBoleto:   payment.bankSlipUrl ?? payment.invoiceUrl ?? null,
        codigoBarras: barcode.identificationField,
      }
    }
  } catch (err) {
    console.error(`[asaas-sync] Erro ao enriquecer pagamento ${payment.id}:`, err)
    Sentry.captureException(err, {
      tags:  { module: 'asaas-sync', operation: 'enriquecer-pagamento' },
      extra: { paymentId: payment.id },
    })
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
      const status   = mapAsaasStatus(payment.status)
      const detalhes = await enriquecerPagamento(payment, forma)
      const pagoEm   = payment.paymentDate ? new Date(payment.paymentDate) : null

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
          vencimento:   new Date(payment.dueDate),
          pagoEm,
          valorPago:    pagoEm ? payment.netValue ?? payment.value : null,
          atualizadoEm: new Date(),
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
      id: true, nome: true, cpf: true, email: true, whatsapp: true, telefone: true,
      cep: true, logradouro: true, numero: true, complemento: true, bairro: true,
      valorMensal: true, vencimentoDia: true, formaPagamento: true,
      planoTipo: true,
      asaasCustomerId:     true,
      asaasSubscriptionId: true,
      empresa: { select: { cnpj: true, razaoSocial: true } },
    },
  })

  if (!cliente) throw new Error(`[asaas-sync] Cliente ${clienteId} não encontrado.`)

  // ── Idempotência total: customer + subscription já existem ───────────────────
  if (cliente.asaasCustomerId && cliente.asaasSubscriptionId) {
    await sincronizarCobrancas(clienteId, cliente.asaasSubscriptionId, cliente.formaPagamento)
    return
  }

  // ── BUG 11: validar CNPJ/CPF antes de chamar a API ───────────────────────────
  const cpfCnpjRaw = (cliente.empresa?.cnpj ?? cliente.cpf ?? '').replace(/\D/g, '')
  if (!cpfCnpjRaw) {
    throw new Error(
      '[asaas-sync] Não é possível provisionar: cliente sem CNPJ (empresa) nem CPF cadastrado. ' +
      'Preencha o CNPJ da empresa ou o CPF do cliente antes de provisionar.',
    )
  }

  const billingType = toBillingType(cliente.formaPagamento)
  const nextDueDate = calcularProximoVencimento(cliente.vencimentoDia)
  const valor       = Number(cliente.valorMensal)

  // ── 1. Customer ──────────────────────────────────────────────────────────────
  // BUG 1: se já tem customerId (subscription falhou antes), reutiliza sem criar novo.
  // Isso evita duplicar o customer no Asaas quando o provisionamento é re-tentado.
  let customerId = cliente.asaasCustomerId

  if (!customerId) {
    const emp      = cliente.empresa
    const customer = await asaasCreateCustomer({
      name:              emp?.razaoSocial ?? cliente.nome,
      cpfCnpj:           cpfCnpjRaw,
      email:             cliente.email,
      mobilePhone:       cliente.whatsapp,
      phone:             cliente.telefone,
      postalCode:        cliente.cep,
      address:           cliente.logradouro,
      addressNumber:     cliente.numero,
      complement:        cliente.complemento,
      province:          cliente.bairro,
      externalReference: clienteId,
    })
    customerId = customer.id

    // Persiste antes de criar a subscription — se subscription falhar,
    // a próxima tentativa vai reutilizar este customerId (BUG 1 fix).
    await prisma.cliente.update({
      where: { id: clienteId },
      data:  { asaasCustomerId: customerId, asaasStatus: 'ACTIVE' },
    })
  }

  // ── 2. Subscription ──────────────────────────────────────────────────────────
  const subscription = await asaasCreateSubscription({
    customerId,
    billingType,
    value:       valor,
    nextDueDate,
    description: `Mensalidade - Plano ${cliente.planoTipo}`,
  })

  await prisma.cliente.update({
    where: { id: clienteId },
    data:  { asaasSubscriptionId: subscription.id, asaasStatus: 'ACTIVE' },
  })

  // ── 3. Sync inicial das cobranças ────────────────────────────────────────────
  await sincronizarCobrancas(clienteId, subscription.id, cliente.formaPagamento)

  console.log(
    `[asaas-sync] Cliente ${clienteId} provisionado — ` +
    `customer: ${customerId}, subscription: ${subscription.id}`,
  )
}

// ─── Alterar vencimento ───────────────────────────────────────────────────────

export async function atualizarVencimentoAsaas(
  clienteId: string,
  novoDia: number,
): Promise<{ proximoVencimento: string }> {
  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: { asaasSubscriptionId: true, formaPagamento: true },
  })

  if (!cliente?.asaasSubscriptionId) {
    throw new Error('[asaas-sync] Cliente sem subscription Asaas. Provisione primeiro.')
  }

  // GAP 7: clientes existentes não devem sofrer a regra de "mínimo 20 dias".
  // Passamos minDias=0 para usar o próximo dia exato (mesmo mês se ainda não passou,
  // mês seguinte se já passou). A regra de 20 dias só faz sentido para novos clientes.
  const proximoVencimento = calcularProximoVencimento(novoDia, 0)

  await asaasUpdateSubscription(cliente.asaasSubscriptionId, {
    nextDueDate:           proximoVencimento,
    updatePendingPayments: true,
  })

  await prisma.cliente.update({
    where: { id: clienteId },
    data:  { vencimentoDia: novoDia },
  })

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
    select: { asaasSubscriptionId: true },
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

    // BUG 8: cancela cobranças abertas localmente para refletir o estado real do Asaas.
    // Sem isso, o portal exibe cobranças "em aberto" de uma subscription já cancelada.
    await prisma.$transaction([
      prisma.cliente.update({
        where: { id: clienteId },
        data:  { asaasSubscriptionId: null, asaasStatus: 'INACTIVE' },
      }),
      prisma.cobrancaAsaas.updateMany({
        where: { clienteId, status: { in: ['PENDING', 'OVERDUE'] } },
        data:  { status: 'CANCELLED', atualizadoEm: new Date() },
      }),
    ])
  } catch (err) {
    console.error(`[asaas-sync] Erro ao suspender subscription do cliente ${clienteId}:`, err)
    Sentry.captureException(err, {
      tags:  { module: 'asaas-sync', operation: 'suspender-subscription' },
      extra: { clienteId },
    })
  }
}

// ─── Reativar ─────────────────────────────────────────────────────────────────

export async function reativarAsaas(clienteId: string): Promise<void> {
  try {
    const cliente = await prisma.cliente.findUnique({
      where:  { id: clienteId },
      select: {
        asaasCustomerId: true,
        valorMensal:     true,
        vencimentoDia:   true,
        formaPagamento:  true,
        planoTipo:       true,
      },
    })

    if (!cliente?.asaasCustomerId) {
      // Nunca foi provisionado — provisiona do zero
      await provisionarClienteAsaas(clienteId)
      return
    }

    // Já tem customer, só recria a subscription
    const billingType = toBillingType(cliente.formaPagamento)
    const nextDueDate = calcularProximoVencimento(cliente.vencimentoDia)
    const valor       = Number(cliente.valorMensal)

    const subscription = await asaasCreateSubscription({
      customerId:  cliente.asaasCustomerId,
      billingType,
      value:       valor,
      nextDueDate,
      description: `Mensalidade - Plano ${cliente.planoTipo} (reativação)`,
    })

    await prisma.cliente.update({
      where: { id: clienteId },
      data:  { asaasSubscriptionId: subscription.id, asaasStatus: 'ACTIVE' },
    })

    await sincronizarCobrancas(clienteId, subscription.id, cliente.formaPagamento)

    console.log(
      `[asaas-sync] Cliente ${clienteId} reativado — nova subscription: ${subscription.id}`,
    )
  } catch (err) {
    // BUG 9: sem este bloco, o cliente ficava com status 'ativo' no banco mas sem
    // subscription no Asaas — sem cobrança sendo gerada e sem rastreabilidade.
    console.error(`[asaas-sync] Erro ao reativar cliente ${clienteId}:`, err)
    Sentry.captureException(err, {
      tags:  { module: 'asaas-sync', operation: 'reativar-asaas' },
      extra: { clienteId },
    })
    throw err  // re-throw para o caller saber que falhou
  }
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

  // Nova cobrança com vencimento em 3 dias corridos a partir de hoje
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

  // Busca detalhes da nova cobrança (QA 3: sem dynamic import — funções já importadas no topo)
  let detalhes: {
    linkBoleto?: string | null
    codigoBarras?: string | null
    pixQrCode?: string | null
    pixCopiaECola?: string | null
  } = {}

  try {
    if (cobranca.formaPagamento === 'pix') {
      const qr = await asaasGetPixQrCode(novoPagamento.id)
      detalhes = { pixQrCode: qr.encodedImage, pixCopiaECola: qr.payload }
    } else {
      const barcode = await asaasGetBoletoBarcode(novoPagamento.id)
      detalhes = {
        linkBoleto:   novoPagamento.bankSlipUrl ?? novoPagamento.invoiceUrl ?? null,
        codigoBarras: barcode.identificationField,
      }
    }
  } catch (err) {
    console.error('[asaas-sync] Erro ao buscar detalhes da segunda via:', err)
    Sentry.captureException(err, {
      tags:  { module: 'asaas-sync', operation: 'detalhes-segunda-via' },
      extra: { cobrancaId: cobranca.id },
    })
  }

  // BUG 7: Salva nova cobrança e cancela a original em uma transação atômica.
  // Sem isso, o portal sempre exibia a cobrança original (mais antiga) em vez da
  // segunda via recém-criada, porque busca orderBy vencimento asc.
  const [nova] = await prisma.$transaction([
    prisma.cobrancaAsaas.create({
      data: {
        asaasId:        novoPagamento.id,
        clienteId:      cobranca.clienteId,
        valor:          novoPagamento.value,
        vencimento:     novaData,
        status:         'PENDING',
        formaPagamento: cobranca.formaPagamento,
        ...detalhes,
      },
    }),
    // Cancela a original localmente para que o portal e o CRM exibam apenas a segunda via.
    // A cobrança original no Asaas continua existindo (não cancelamos lá) — se o cliente
    // pagar qualquer uma das duas, o webhook PAYMENT_RECEIVED atualiza o status correto.
    prisma.cobrancaAsaas.update({
      where: { id: cobrancaId },
      data:  { status: 'CANCELLED', atualizadoEm: new Date() },
    }),
  ])

  return { ...detalhes, novaCobrancaId: nova.id }
}
