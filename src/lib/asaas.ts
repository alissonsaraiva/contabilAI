/**
 * Cliente HTTP da API Asaas.
 *
 * Documentação: https://docs.asaas.com/reference
 * Sandbox:    https://sandbox.asaas.com/api/v3
 * Produção:   https://www.asaas.com/api/v3
 *
 * Autenticação: header `access_token: <api_key>`
 */
import { prisma } from '@/lib/prisma'
import type { AsaasStatusCobranca, FormaPagamento } from '@prisma/client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type AsaasBillingType = 'BOLETO' | 'PIX'
export type AsaasSubscriptionCycle = 'MONTHLY'

export type AsaasCustomer = {
  id: string
  name: string
  cpfCnpj: string
  email?: string | null
  mobilePhone?: string | null
  deleted: boolean
}

export type AsaasSubscription = {
  id: string
  customer: string
  billingType: AsaasBillingType
  cycle: AsaasSubscriptionCycle
  value: number
  nextDueDate: string  // YYYY-MM-DD
  status: 'ACTIVE' | 'INACTIVE' | 'OVERDUE'
}

export type AsaasPayment = {
  id: string
  customer: string
  subscription?: string | null
  billingType: AsaasBillingType
  value: number
  netValue?: number
  dueDate: string       // YYYY-MM-DD
  status: 'PENDING' | 'RECEIVED' | 'CONFIRMED' | 'OVERDUE' | 'REFUNDED' | 'RECEIVED_IN_CASH' | 'REFUND_REQUESTED' | 'CHARGEBACK_REQUESTED' | 'CHARGEBACK_DISPUTE' | 'AWAITING_CHARGEBACK_REVERSAL' | 'DUNNING_REQUESTED' | 'DUNNING_RECEIVED' | 'AWAITING_RISK_ANALYSIS'
  paymentDate?: string | null
  bankSlipUrl?: string | null
  invoiceUrl?: string | null
}

export type AsaasPixQrCode = {
  encodedImage: string   // base64 PNG
  payload: string        // copia e cola (EMV)
  expirationDate: string
}

export type AsaasBoletoBarcode = {
  identificationField: string   // código de barras
  nossoNumero: string
  barCode: string
}

export type AsaasListResponse<T> = {
  object: 'list'
  hasMore: boolean
  totalCount: number
  limit: number
  offset: number
  data: T[]
}

// ─── Factory ──────────────────────────────────────────────────────────────────

async function getConfig(): Promise<{ baseUrl: string; apiKey: string }> {
  const escritorio = await prisma.escritorio.findFirst({
    select: { asaasApiKey: true, asaasAmbiente: true },
  })

  const apiKey = escritorio?.asaasApiKey
  if (!apiKey) throw new Error('[Asaas] API key não configurada. Acesse Configurações → Integrações → Asaas.')

  const ambiente = escritorio?.asaasAmbiente ?? 'sandbox'
  const baseUrl = ambiente === 'producao'
    ? 'https://www.asaas.com/api/v3'
    : 'https://sandbox.asaas.com/api/v3'

  return { baseUrl, apiKey }
}

async function asaasFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { baseUrl, apiKey } = await getConfig()
  const url = `${baseUrl}${path}`

  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(15_000),  // 15s — evita travar o worker indefinidamente
    headers: {
      'Content-Type': 'application/json',
      'access_token': apiKey,
      ...options.headers,
    },
  })

  if (!response.ok) {
    let body = ''
    try { body = await response.text() } catch { /* */ }
    throw new Error(`[Asaas] ${options.method ?? 'GET'} ${path} → ${response.status}: ${body}`)
  }

  return response.json() as Promise<T>
}

// ─── Customers ────────────────────────────────────────────────────────────────

export async function asaasCreateCustomer(params: {
  name: string
  cpfCnpj: string
  email?: string | null
  mobilePhone?: string | null
  phone?: string | null
  postalCode?: string | null
  address?: string | null
  addressNumber?: string | null
  complement?: string | null
  province?: string | null
  externalReference?: string | null
}): Promise<AsaasCustomer> {
  return asaasFetch<AsaasCustomer>('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name:              params.name,
      cpfCnpj:           params.cpfCnpj.replace(/\D/g, ''),
      email:             params.email             ?? undefined,
      mobilePhone:       params.mobilePhone       ? params.mobilePhone.replace(/\D/g, '')  : undefined,
      phone:             params.phone             ? params.phone.replace(/\D/g, '')         : undefined,
      postalCode:        params.postalCode        ? params.postalCode.replace(/\D/g, '')    : undefined,
      address:           params.address           ?? undefined,
      addressNumber:     params.addressNumber     ?? undefined,
      complement:        params.complement        ?? undefined,
      province:          params.province          ?? undefined,
      externalReference: params.externalReference ?? undefined,
    }),
  })
}

export async function asaasGetCustomer(customerId: string): Promise<AsaasCustomer> {
  return asaasFetch<AsaasCustomer>(`/customers/${customerId}`)
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export async function asaasCreateSubscription(params: {
  customerId: string
  billingType: AsaasBillingType
  value: number
  nextDueDate: string   // YYYY-MM-DD
  description?: string
}): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      customer:    params.customerId,
      billingType: params.billingType,
      cycle:       'MONTHLY',
      value:       params.value,
      nextDueDate: params.nextDueDate,
      description: params.description ?? 'Mensalidade',
    }),
  })
}

export async function asaasUpdateSubscription(
  subscriptionId: string,
  params: {
    nextDueDate?: string
    billingType?: AsaasBillingType
    value?: number
    updatePendingPayments?: boolean
  },
): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>(`/subscriptions/${subscriptionId}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...(params.nextDueDate           && { nextDueDate: params.nextDueDate }),
      ...(params.billingType           && { billingType: params.billingType }),
      ...(params.value !== undefined   && { value: params.value }),
      updatePendingPayments: params.updatePendingPayments ?? true,
    }),
  })
}

export async function asaasCancelSubscription(subscriptionId: string): Promise<void> {
  await asaasFetch<unknown>(`/subscriptions/${subscriptionId}`, { method: 'DELETE' })
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function asaasListPayments(params: {
  subscriptionId: string
  limit?: number
  offset?: number
}): Promise<AsaasListResponse<AsaasPayment>> {
  const qs = new URLSearchParams({
    subscription: params.subscriptionId,
    limit:        String(params.limit  ?? 24),
    offset:       String(params.offset ?? 0),
  })
  return asaasFetch<AsaasListResponse<AsaasPayment>>(`/payments?${qs}`)
}

export async function asaasGetPayment(paymentId: string): Promise<AsaasPayment> {
  return asaasFetch<AsaasPayment>(`/payments/${paymentId}`)
}

/** Cria uma nova cobrança avulsa (usado para segunda via). */
export async function asaasCreatePayment(params: {
  customerId: string
  billingType: AsaasBillingType
  value: number
  dueDate: string      // YYYY-MM-DD
  description?: string
}): Promise<AsaasPayment> {
  return asaasFetch<AsaasPayment>('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer:    params.customerId,
      billingType: params.billingType,
      value:       params.value,
      dueDate:     params.dueDate,
      description: params.description ?? 'Segunda via',
    }),
  })
}

/** Cancela uma cobrança avulsa no Asaas (POST /payments/{id}/cancel). */
export async function asaasCancelPayment(paymentId: string): Promise<void> {
  await asaasFetch<unknown>(`/payments/${paymentId}/cancel`, { method: 'POST' })
}

export async function asaasGetPixQrCode(paymentId: string): Promise<AsaasPixQrCode> {
  return asaasFetch<AsaasPixQrCode>(`/payments/${paymentId}/pixQrCode`)
}

export async function asaasGetBoletoBarcode(paymentId: string): Promise<AsaasBoletoBarcode> {
  return asaasFetch<AsaasBoletoBarcode>(`/payments/${paymentId}/identificationField`)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calcula o próximo vencimento para uma assinatura nova.
 *
 * Regra de negócio: o cliente nunca deve ser cobrado antes de `minDias` (padrão 20)
 * dias após a assinatura do contrato. Se o vencimento escolhido cair dentro dessa
 * janela, o primeiro boleto é postergado para o mês seguinte.
 *
 * Exemplos (minDias = 20):
 *   assinatura 25/mar, dia 5  → próximo dia 5 = 11 dias → pula para 05/mai
 *   assinatura 25/mar, dia 28 → próximo dia 28 =  3 dias → pula para 28/abr
 *   assinatura 25/mar, dia 20 → próximo dia 20 = 26 dias → ok, fica 20/abr
 */
export function calcularProximoVencimento(vencimentoDia: number, minDias: number = 20): string {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  function proximaOcorrencia(anoBase: number, mesBase: number): Date {
    const maxDia = new Date(anoBase, mesBase + 1, 0).getDate()
    return new Date(anoBase, mesBase, Math.min(vencimentoDia, maxDia))
  }

  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()  // 0-indexed

  let candidata = proximaOcorrencia(ano, mes)

  // Se a candidata já passou ou está muito próxima, vai para o próximo mês
  const diffDias = Math.ceil((candidata.getTime() - hoje.getTime()) / 86_400_000)
  if (diffDias < minDias) {
    candidata = proximaOcorrencia(ano, mes + 1)
  }

  return candidata.toISOString().slice(0, 10) // YYYY-MM-DD
}

/**
 * Calcula o valor proporcional para a primeira cobrança quando o contrato é
 * assinado no meio do ciclo.
 *
 * Útil quando o escritório optar por cobrar proporcionalmente os dias de serviço
 * desde a assinatura até o primeiro vencimento regular (ao invés de dar de graça).
 *
 * Retorna o valor proporcional com 2 casas decimais.
 */
export function calcularProporcional(params: {
  valorMensal: number
  dataAssinatura: Date
  primeirVencimento: Date
}): number {
  const { valorMensal, dataAssinatura, primeirVencimento } = params
  const diasNoMes = new Date(
    primeirVencimento.getFullYear(),
    primeirVencimento.getMonth() + 1,
    0,
  ).getDate()

  const diffMs = primeirVencimento.getTime() - dataAssinatura.getTime()
  const diasServico = Math.max(1, Math.ceil(diffMs / 86_400_000))

  const proporcional = (valorMensal / diasNoMes) * diasServico
  return Math.round(proporcional * 100) / 100
}

/** Formata data Date → YYYY-MM-DD para a API do Asaas. */
export function toAsaasDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Mapeia FormaPagamento local → billingType do Asaas. */
export function toBillingType(forma: string): AsaasBillingType {
  if (forma === 'pix') return 'PIX'
  if (forma === 'boleto') return 'BOLETO'
  throw new Error(`[Asaas] Forma de pagamento não suportada: ${forma}. Use pix ou boleto.`)
}

/**
 * Mapeia billingType do Asaas → FormaPagamento local.
 * Centralizado aqui para evitar duplicação entre asaas-sync.ts e webhook.
 */
export function mapBillingTypeToLocal(billingType: string): FormaPagamento {
  if (billingType === 'PIX') return 'pix'
  if (billingType === 'BOLETO') return 'boleto'
  return 'boleto' // fallback conservador
}

/**
 * Mapeia status do Asaas → AsaasStatusCobranca local.
 * Centralizado aqui para evitar duplicação entre asaas-sync.ts e webhook.
 */
export function mapAsaasStatus(asaasStatus: string): AsaasStatusCobranca {
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
