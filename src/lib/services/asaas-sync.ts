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
 *   gerarSegundaVia          — cria nova cobrança avulsa, cancela a original no Asaas e localmente
 */
import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { resolverEmpresaPrincipalDoObjeto } from '@/lib/ai/tools/resolver-empresa'
import {
  asaasCreateCustomer,
  asaasCreateSubscription,
  asaasUpdateSubscription,
  asaasCancelSubscription,
  asaasListPayments,
  asaasCreatePayment,
  asaasCancelPayment,
  asaasGetPixQrCode,
  asaasGetBoletoBarcode,
  calcularProximoVencimento,
  mapAsaasStatus,
  toBillingType,
  toAsaasDate,
} from '@/lib/asaas'
import { indexarAsync } from '@/lib/rag/indexar-async'
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
  pixGeradoEm?: Date | null
  invoiceUrl?: string | null
}> {
  // invoiceUrl é capturado para todos os status — serve como comprovante público
  const invoiceUrl = payment.invoiceUrl ?? null

  // Só busca detalhes de pagamento pendentes/vencidos
  if (!['PENDING', 'OVERDUE'].includes(payment.status)) return { invoiceUrl }

  try {
    if (forma === 'pix') {
      const qr = await asaasGetPixQrCode(payment.id)
      return {
        invoiceUrl,
        pixQrCode:    qr.encodedImage,
        pixCopiaECola: qr.payload,
        pixGeradoEm:  new Date(),
      }
    }
    if (forma === 'boleto') {
      const barcode = await asaasGetBoletoBarcode(payment.id)
      return {
        invoiceUrl,
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
  return { invoiceUrl }
}

// ─── Sincronizar cobranças ────────────────────────────────────────────────────

const SYNC_MAX_PAGES = 50  // guard de segurança: 50 × 24 = 1.200 cobranças máx por sync

export async function sincronizarCobrancas(
  clienteId: string,
  subscriptionId: string,
  forma: FormaPagamento,
): Promise<void> {
  let offset = 0
  const limit = 24
  let page    = 0

  while (page < SYNC_MAX_PAGES) {
    page++
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
          invoiceUrl:     payment.invoiceUrl ?? null,
          ...detalhes,
        },
        update: {
          status,
          vencimento:   new Date(payment.dueDate),
          pagoEm,
          valorPago:    pagoEm ? payment.netValue ?? payment.value : null,
          invoiceUrl:   payment.invoiceUrl ?? null,
          atualizadoEm: new Date(),
          ...detalhes,
        },
      })
    }

    if (!lista.hasMore) break
    offset += limit
  }

  if (page >= SYNC_MAX_PAGES) {
    console.warn(
      `[asaas-sync] sincronizarCobrancas: limite de ${SYNC_MAX_PAGES} páginas atingido ` +
      `para subscription ${subscriptionId} (cliente ${clienteId}). Verifique o Asaas.`,
    )
    Sentry.captureMessage('[asaas-sync] Limite de paginação atingido em sincronizarCobrancas', {
      level: 'warning',
      tags:  { module: 'asaas-sync', operation: 'sincronizar-cobrancas' },
      extra: { subscriptionId, clienteId, maxPages: SYNC_MAX_PAGES },
    })
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
      clienteEmpresas: {
        where:   { principal: true },
        select:  { empresa: { select: { cnpj: true, razaoSocial: true } } },
        orderBy: { principal: 'desc' as const },
        take:    1,
      },
    },
  })

  if (!cliente) throw new Error(`[asaas-sync] Cliente ${clienteId} não encontrado.`)

  // ── Idempotência total: customer + subscription já existem ───────────────────
  if (cliente.asaasCustomerId && cliente.asaasSubscriptionId) {
    await sincronizarCobrancas(clienteId, cliente.asaasSubscriptionId, cliente.formaPagamento)
    return
  }

  // Resolve empresa: prioriza 1:N, fallback para legado 1:1
  const empResolvida = resolverEmpresaPrincipalDoObjeto(cliente)
  const cnpjEmpresa  = empResolvida?.cnpj ?? null

  const cpfCnpjRaw = (cnpjEmpresa ?? cliente.cpf ?? '').replace(/\D/g, '')
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
    const customer = await asaasCreateCustomer({
      name:              empResolvida?.razaoSocial ?? cliente.nome,
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

// ─── Refresh PIX sem cancelar cobrança ───────────────────────────────────────

/**
 * Renova o QR code PIX de uma cobrança PENDING existente via Asaas,
 * sem cancelar nem criar nova cobrança. Atualiza pixCopiaECola, pixQrCode
 * e pixGeradoEm no banco.
 *
 * Usar quando: PIX expirado (>20h) e cobrança ainda PENDING.
 * Para OVERDUE ou segunda via explícita, usar gerarSegundaVia.
 * Retorna null em caso de falha (best-effort — não deve bloquear o fluxo).
 */
export async function refresharPixCobranca(cobrancaId: string): Promise<{
  pixCopiaECola: string
  pixQrCode: string
} | null> {
  try {
    const cobranca = await prisma.cobrancaAsaas.findUnique({
      where:  { id: cobrancaId },
      select: { asaasId: true, formaPagamento: true, status: true },
    })
    if (!cobranca?.asaasId || cobranca.formaPagamento !== 'pix' || cobranca.status !== 'PENDING') return null

    const qr = await asaasGetPixQrCode(cobranca.asaasId)

    await prisma.cobrancaAsaas.update({
      where: { id: cobrancaId },
      data:  { pixCopiaECola: qr.payload, pixQrCode: qr.encodedImage, pixGeradoEm: new Date() },
    })

    return { pixCopiaECola: qr.payload, pixQrCode: qr.encodedImage }
  } catch (err) {
    console.error('[asaas-sync] refresharPixCobranca falhou, retornando null:', err)
    Sentry.captureException(err, {
      tags:  { module: 'asaas-sync', operation: 'refresharPixCobranca' },
      extra: { cobrancaId },
    })
    return null
  }
}

// ─── Atualizar valor da mensalidade ───────────────────────────────────────────

/**
 * Atualiza o valor da mensalidade de um cliente.
 *
 * Se o cliente tiver subscription no Asaas, atualiza lá também (incluindo
 * cobranças em aberto via updatePendingPayments: true).
 * Se não tiver, atualiza apenas o banco local.
 */
export async function atualizarValorMensalidadeAsaas(
  clienteId: string,
  novoValor: number,
): Promise<{ asaas: boolean }> {
  if (novoValor <= 0) {
    throw new Error('[asaas-sync] Valor da mensalidade deve ser maior que zero.')
  }

  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: { asaasSubscriptionId: true, formaPagamento: true },
  })

  if (!cliente) {
    throw new Error(`[asaas-sync] Cliente ${clienteId} não encontrado.`)
  }

  if (!cliente.asaasSubscriptionId) {
    // Sem Asaas: atualiza apenas localmente
    await prisma.cliente.update({
      where: { id: clienteId },
      data:  { valorMensal: novoValor },
    })
    return { asaas: false }
  }

  // Atualiza subscription no Asaas (updatePendingPayments: true aplica nas cobranças em aberto)
  await asaasUpdateSubscription(cliente.asaasSubscriptionId, {
    value:                novoValor,
    updatePendingPayments: true,
  })

  await prisma.cliente.update({
    where: { id: clienteId },
    data:  { valorMensal: novoValor },
  })

  // Sincroniza cobranças para refletir novo valor localmente.
  // Best-effort: se falhar, o valor já está correto no Asaas e no banco.
  // A aba financeiro do cliente fará novo sync na próxima abertura.
  try {
    await sincronizarCobrancas(clienteId, cliente.asaasSubscriptionId, cliente.formaPagamento)
  } catch (err) {
    console.warn(`[asaas-sync] atualizarValorMensalidadeAsaas: sync pós-atualização falhou para cliente ${clienteId} (valor já atualizado no Asaas e banco):`, err)
    Sentry.captureException(err, {
      tags:  { module: 'asaas-sync', operation: 'sync-pos-atualizar-mensalidade' },
      extra: { clienteId, novoValor },
    })
  }

  return { asaas: true }
}

// ─── Reajuste de mensalidades em lote ────────────────────────────────────────

export type ResultadoReajuste = {
  total:       number   // total de clientes elegíveis
  atualizados: number   // atualizados com sucesso (Asaas + banco)
  semAsaas:    number   // atualizados apenas no banco (sem subscription)
  erros:       number   // falhas — banco NÃO foi alterado nesses casos
  detalhesErros: Array<{ clienteId: string; nome: string; erro: string }>
}

/**
 * Aplica reajuste percentual no valor da mensalidade de todos os clientes elegíveis.
 *
 * Elegíveis: status 'ativo' ou 'inadimplente' com valorMensal > 0.
 * Clientes inativos/cancelados são ignorados.
 * Processa sequencialmente para não sobrecarregar a API do Asaas.
 *
 * Garante valor mínimo de R$ 1,00 após reajuste.
 * Em caso de erro em um cliente, continua nos demais.
 */
export async function reajustarMensalidadesEmLote(
  percentual: number,
  /** Quando fornecido, processa apenas estes clientes (usado para retry dos que falharam). */
  clienteIds?: string[],
): Promise<ResultadoReajuste> {
  if (percentual === 0) {
    throw new Error('[asaas-sync] Percentual de reajuste não pode ser zero.')
  }
  if (percentual < -99 || percentual > 500) {
    throw new Error('[asaas-sync] Percentual fora do intervalo permitido (-99 a 500).')
  }

  const clientes = await prisma.cliente.findMany({
    where: {
      ...(clienteIds?.length ? { id: { in: clienteIds } } : {
        status:      { in: ['ativo', 'inadimplente'] },
        valorMensal: { gt: 0 },
      }),
    },
    select: {
      id:                  true,
      nome:                true,
      valorMensal:         true,
      asaasSubscriptionId: true,
      formaPagamento:      true,
    },
    orderBy: { nome: 'asc' },
  })

  const resultado: ResultadoReajuste = {
    total:         clientes.length,
    atualizados:   0,
    semAsaas:      0,
    erros:         0,
    detalhesErros: [],
  }

  for (const cliente of clientes) {
    try {
      const valorAtual = Number(cliente.valorMensal)
      // Calcula novo valor com 2 casas decimais, mínimo R$ 1,00
      const novoValor = Math.max(1, Math.round(valorAtual * (1 + percentual / 100) * 100) / 100)

      if (!cliente.asaasSubscriptionId) {
        // Sem Asaas: atualiza apenas banco
        const atualizado = await prisma.cliente.update({
          where: { id: cliente.id },
          data:  { valorMensal: novoValor },
        })
        indexarAsync('cliente', atualizado)
        resultado.semAsaas++
        resultado.atualizados++
        continue
      }

      // Com Asaas: atualiza subscription no Asaas + banco local.
      // ⚠️ Intencional: NÃO chamamos sincronizarCobrancas aqui para evitar timeout em lote
      // (o sync faz N chamadas adicionais por cliente e tornaria a operação inviável para
      // escritórios com muitos clientes). O sync ocorre na próxima abertura da aba Financeiro
      // do cliente — comportamento idêntico ao que já acontece após alterar vencimento/forma.
      await asaasUpdateSubscription(cliente.asaasSubscriptionId, {
        value:                novoValor,
        updatePendingPayments: true,
      })

      const atualizado = await prisma.cliente.update({
        where: { id: cliente.id },
        data:  { valorMensal: novoValor },
      })
      indexarAsync('cliente', atualizado)

      resultado.atualizados++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[asaas-sync] reajustarMensalidadesEmLote: erro no cliente ${cliente.id}:`, err)
      Sentry.captureException(err, {
        tags:  { module: 'asaas-sync', operation: 'reajustar-mensalidades-lote' },
        extra: { clienteId: cliente.id, nome: cliente.nome, percentual },
      })
      resultado.erros++
      resultado.detalhesErros.push({ clienteId: cliente.id, nome: cliente.nome, erro: msg })
    }
  }

  console.log(
    `[asaas-sync] reajustarMensalidadesEmLote: percentual=${percentual}% | ` +
    `total=${resultado.total} | ok=${resultado.atualizados} | erros=${resultado.erros}`,
  )

  return resultado
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
    include: { cliente: { select: { asaasCustomerId: true, formaPagamento: true } } },
  })

  if (!cobranca) throw new Error('[asaas-sync] Cobrança não encontrada.')
  if (!cobranca.cliente.asaasCustomerId) throw new Error('[asaas-sync] Cliente sem customer Asaas.')

  // Usa a forma de pagamento atual do cliente (não a da cobrança original),
  // pois o cliente pode ter alterado PIX ↔ boleto entre a geração original e a segunda via.
  const formaAtual = cobranca.cliente.formaPagamento

  // Nova cobrança com vencimento em 3 dias corridos a partir de hoje
  const novaData = new Date()
  novaData.setDate(novaData.getDate() + 3)
  const dueDate = toAsaasDate(novaData)

  const novoPagamento = await asaasCreatePayment({
    customerId:  cobranca.cliente.asaasCustomerId,
    billingType: toBillingType(formaAtual),
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
    pixGeradoEm?: Date | null
  } = {}

  try {
    if (formaAtual === 'pix') {
      const qr = await asaasGetPixQrCode(novoPagamento.id)
      detalhes = { pixQrCode: qr.encodedImage, pixCopiaECola: qr.payload, pixGeradoEm: new Date() }
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

  // Cancela a cobrança original no Asaas para evitar que o cliente receba lembretes
  // duplicados e para impedir que um pagamento da original deixe a segunda via como PENDING.
  // Best-effort: se falhar, o fluxo local continua (a original ainda será cancelada localmente).
  try {
    await asaasCancelPayment(cobranca.asaasId)
  } catch (err) {
    console.error('[asaas-sync] Não foi possível cancelar a cobrança original no Asaas:', err)
    Sentry.captureException(err, {
      tags:  { module: 'asaas-sync', operation: 'cancelar-original-asaas' },
      extra: { cobrancaId: cobranca.id, asaasId: cobranca.asaasId },
    })
  }

  // Salva nova cobrança e cancela a original em uma transação atômica.
  const [nova] = await prisma.$transaction([
    prisma.cobrancaAsaas.create({
      data: {
        asaasId:        novoPagamento.id,
        clienteId:      cobranca.clienteId,
        valor:          novoPagamento.value,
        vencimento:     novaData,
        status:         'PENDING',
        formaPagamento: formaAtual,
        invoiceUrl:     novoPagamento.invoiceUrl ?? null,
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
