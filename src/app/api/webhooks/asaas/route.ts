/**
 * Webhook Asaas — recebe eventos de pagamento.
 *
 * Configurar em: Asaas → Configurações → Integrações → Webhook
 * URL: https://seudominio/api/webhooks/asaas
 *
 * Eventos tratados:
 *   PAYMENT_RECEIVED  → marca pago, reativa cliente inadimplente
 *   PAYMENT_CONFIRMED → idem (Asaas envia um ou outro dependendo da forma)
 *   PAYMENT_OVERDUE   → marca vencido, marca cliente como inadimplente, notifica equipe
 *   PAYMENT_CREATED   → salva nova cobrança no banco local
 *   PAYMENT_UPDATED   → atualiza dados (data, valor) + re-enriquece PIX/boleto
 *   PAYMENT_DELETED   → cancela cobrança local
 *   PAYMENT_REFUNDED  → marca como reembolsado
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  sincronizarCobrancas,
} from '@/lib/services/asaas-sync'
import {
  mapAsaasStatus,
  mapBillingTypeToLocal,
  asaasGetPixQrCode,
  asaasGetBoletoBarcode,
} from '@/lib/asaas'
import { notificarClienteInadimplente } from '@/lib/notificacoes'
import { indexarAsync } from '@/lib/rag/indexar-async'
import type { StatusCliente } from '@prisma/client'

type AsaasWebhookPayload = {
  event: string
  payment: {
    id: string
    customer: string
    subscription?: string | null
    billingType: string
    value: number
    netValue?: number
    dueDate: string       // YYYY-MM-DD
    paymentDate?: string | null
    status: string
    bankSlipUrl?: string | null
    invoiceUrl?: string | null
  }
}

async function verificarToken(req: Request): Promise<boolean> {
  const escritorio = await prisma.escritorio.findFirst({
    select: { asaasWebhookToken: true },
  })
  const token = escritorio?.asaasWebhookToken
  if (!token) {
    console.error('[Asaas webhook] ERRO: asaasWebhookToken não configurado — requisição bloqueada.')
    return false
  }
  const recebido = req.headers.get('asaas-access-token') ?? req.headers.get('access_token')
  return recebido === token
}

// ─── Helper compartilhado: lógica de reativação de cliente inadimplente ────────
// BUG 5: extraída para evitar duplicação idêntica entre PAYMENT_CONFIRMED e PAYMENT_RECEIVED.

async function reativarClienteSeInadimplente(clienteId: string): Promise<void> {
  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: { id: true, status: true, asaasStatus: true },
  })

  if (!cliente) return

  if (cliente.status === 'inadimplente') {
    const [atualizado, historico] = await Promise.all([
      prisma.cliente.update({
        where: { id: cliente.id },
        data:  { status: 'ativo', reativadoEm: new Date(), asaasStatus: 'ACTIVE' },
      }),
      prisma.clienteStatusHistorico.create({
        data: {
          clienteId:    cliente.id,
          statusAntes:  'inadimplente',
          statusDepois: 'ativo',
          motivo:       'Pagamento confirmado via Asaas',
        },
      }),
    ])
    indexarAsync('cliente', atualizado)
    indexarAsync('statusHistorico', { ...historico, criadoEm: new Date() })
    console.log(`[Asaas webhook] Cliente ${clienteId} reativado após pagamento confirmado.`)
  } else {
    // Mantém asaasStatus sincronizado mesmo sem mudança de status do cliente
    await prisma.cliente.update({
      where: { id: cliente.id },
      data:  { asaasStatus: 'ACTIVE' },
    })
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const autorizado = await verificarToken(req)
  if (!autorizado) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let payload: AsaasWebhookPayload
  try {
    payload = await req.json() as AsaasWebhookPayload
  } catch {
    return NextResponse.json({ error: 'payload inválido' }, { status: 400 })
  }

  const { event, payment } = payload
  if (!payment?.id) return NextResponse.json({ ok: true, ignored: true })

  const paymentId = payment.id

  // BUG 2: try/catch global — garante que qualquer exceção não tratada retorna 200
  // em vez de 500. O Asaas reenvía webhooks em caso de 5xx, o que pode causar
  // duplicação de histórico/notificações em caso de falha parcial.
  try {

    // ── PAYMENT_CREATED ──────────────────────────────────────────────────────
    if (event === 'PAYMENT_CREATED') {
      const cliente = await prisma.cliente.findFirst({
        where:  { asaasCustomerId: payment.customer },
        select: { id: true, formaPagamento: true },
      })
      if (!cliente) return NextResponse.json({ ok: true, notFound: true })

      const forma = mapBillingTypeToLocal(payment.billingType)

      // Salva a cobrança básica — detalhes PIX/boleto chegam via enriquecimento em background
      await prisma.cobrancaAsaas.upsert({
        where:  { asaasId: paymentId },
        create: {
          asaasId:        paymentId,
          clienteId:      cliente.id,
          valor:          payment.value,
          vencimento:     new Date(payment.dueDate),
          status:         mapAsaasStatus(payment.status),
          formaPagamento: forma,
          linkBoleto:     payment.bankSlipUrl ?? payment.invoiceUrl ?? null,
          invoiceUrl:     payment.invoiceUrl ?? null,
        },
        update: {
          status:       mapAsaasStatus(payment.status),
          vencimento:   new Date(payment.dueDate),
          invoiceUrl:   payment.invoiceUrl ?? null,
          atualizadoEm: new Date(),
        },
      })

      // BUG 10: adiciona Sentry ao path de erro do enriquecimento assíncrono.
      // O setImmediate é mantido para evitar timeout do webhook (enriquecimento pode demorar).
      // Em ambiente VPS com Docker, setImmediate completa mesmo após a resposta ser enviada.
      setImmediate(() => {
        prisma.cliente.findUnique({
          where:  { id: cliente.id },
          select: { asaasSubscriptionId: true, formaPagamento: true },
        })
          .then(c => {
            if (c?.asaasSubscriptionId) {
              return sincronizarCobrancas(cliente.id, c.asaasSubscriptionId, c.formaPagamento)
            }
          })
          .catch((err: unknown) => {
            console.error('[Asaas webhook] Erro ao sincronizar após PAYMENT_CREATED:', err)
            Sentry.captureException(err, {
              tags:  { module: 'asaas-webhook', operation: 'sync-pos-payment-created' },
              extra: { clienteId: cliente.id, paymentId },
            })
          })
      })

      return NextResponse.json({ ok: true })
    }

    // ── PAYMENT_UPDATED ──────────────────────────────────────────────────────
    if (event === 'PAYMENT_UPDATED') {
      const cobranca = await prisma.cobrancaAsaas.findFirst({
        where:  { asaasId: paymentId },
        select: { id: true, formaPagamento: true },
      })

      if (!cobranca) return NextResponse.json({ ok: true, notFound: true })

      await prisma.cobrancaAsaas.update({
        where: { id: cobranca.id },
        data:  {
          valor:        payment.value,
          vencimento:   new Date(payment.dueDate),
          status:       mapAsaasStatus(payment.status),
          invoiceUrl:   payment.invoiceUrl ?? null,
          atualizadoEm: new Date(),
        },
      })

      // BUG 6: re-enriquece PIX/boleto quando a cobrança ainda está em aberto.
      // Sem isso, o cliente via portal/CRM via código antigo (valor ou data diferente).
      if (['PENDING', 'OVERDUE'].includes(payment.status)) {
        setImmediate(async () => {
          try {
            const forma = cobranca.formaPagamento
            if (forma === 'pix') {
              const qr = await asaasGetPixQrCode(paymentId)
              await prisma.cobrancaAsaas.update({
                where: { id: cobranca.id },
                data:  {
                  pixQrCode:    qr.encodedImage,
                  pixCopiaECola: qr.payload,
                  atualizadoEm: new Date(),
                },
              })
            } else if (forma === 'boleto') {
              const barcode = await asaasGetBoletoBarcode(paymentId)
              await prisma.cobrancaAsaas.update({
                where: { id: cobranca.id },
                data:  {
                  linkBoleto:   payment.bankSlipUrl ?? payment.invoiceUrl ?? null,
                  codigoBarras: barcode.identificationField,
                  atualizadoEm: new Date(),
                },
              })
            }
          } catch (err) {
            console.error('[Asaas webhook] Erro ao re-enriquecer após PAYMENT_UPDATED:', err)
            Sentry.captureException(err, {
              tags:  { module: 'asaas-webhook', operation: 're-enriquecer-payment-updated' },
              extra: { paymentId, cobrancaId: cobranca.id },
            })
          }
        })
      }

      return NextResponse.json({ ok: true })
    }

    // ── PAYMENT_DELETED ──────────────────────────────────────────────────────
    if (event === 'PAYMENT_DELETED') {
      await prisma.cobrancaAsaas.updateMany({
        where: { asaasId: paymentId },
        data:  { status: 'CANCELLED', atualizadoEm: new Date() },
      })
      return NextResponse.json({ ok: true })
    }

    // ── PAYMENT_REFUNDED ─────────────────────────────────────────────────────
    if (event === 'PAYMENT_REFUNDED') {
      await prisma.cobrancaAsaas.updateMany({
        where: { asaasId: paymentId },
        data:  { status: 'REFUNDED', atualizadoEm: new Date() },
      })
      return NextResponse.json({ ok: true })
    }

    // ── PAYMENT_CONFIRMED + PAYMENT_RECEIVED ─────────────────────────────────
    // BUG 5: lógica unificada — Asaas envia PAYMENT_CONFIRMED (boleto/pix à vista) ou
    // PAYMENT_RECEIVED (confirmação bancária). Comportamento idêntico para ambos.
    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
      const pagoEm = payment.paymentDate ? new Date(payment.paymentDate) : new Date()

      // Busca o cliente pelo customerId para o caso de o registro de cobrança não existir
      const clienteRef = await prisma.cliente.findFirst({
        where:  { asaasCustomerId: payment.customer },
        select: { id: true, formaPagamento: true },
      })

      // BUG 3: usa upsert em vez de updateMany para lidar com o caso em que o webhook
      // PAYMENT_RECEIVED chega antes do PAYMENT_CREATED (Asaas pode reordenar eventos).
      // Com updateMany, a cobrança não seria registrada e o cliente não seria reativado.
      if (clienteRef) {
        await prisma.cobrancaAsaas.upsert({
          where:  { asaasId: paymentId },
          create: {
            asaasId:        paymentId,
            clienteId:      clienteRef.id,
            valor:          payment.value,
            vencimento:     new Date(payment.dueDate),
            status:         'RECEIVED',
            formaPagamento: mapBillingTypeToLocal(payment.billingType),
            pagoEm,
            valorPago:      payment.netValue ?? payment.value,
            invoiceUrl:     payment.invoiceUrl ?? null,
          },
          update: {
            status:       'RECEIVED',
            pagoEm,
            valorPago:    payment.netValue ?? payment.value,
            invoiceUrl:   payment.invoiceUrl ?? null,
            atualizadoEm: new Date(),
          },
        })

        // Reativa cliente inadimplente se necessário (lógica unificada — BUG 5)
        await reativarClienteSeInadimplente(clienteRef.id)
      } else {
        // Fallback: tenta atualizar pelo asaasId caso o customerId não esteja cadastrado
        const cobrancaExistente = await prisma.cobrancaAsaas.findFirst({
          where:  { asaasId: paymentId },
          select: { clienteId: true },
        })
        if (cobrancaExistente) {
          await prisma.cobrancaAsaas.updateMany({
            where: { asaasId: paymentId },
            data:  {
              status:       'RECEIVED',
              pagoEm,
              valorPago:    payment.netValue ?? payment.value,
              invoiceUrl:   payment.invoiceUrl ?? null,
              atualizadoEm: new Date(),
            },
          })
          await reativarClienteSeInadimplente(cobrancaExistente.clienteId)
        } else {
          console.warn(
            `[Asaas webhook] ${event}: payment ${paymentId} não encontrado localmente ` +
            `e customer ${payment.customer} não mapeado. Pagamento ignorado.`,
          )
          Sentry.captureMessage(
            `[Asaas webhook] ${event} sem registro local — paymentId: ${paymentId}`,
            { level: 'warning', tags: { module: 'asaas-webhook', operation: event }, extra: { paymentId, customer: payment.customer } },
          )
        }
      }

      console.log(`[Asaas webhook] ${event} processado — paymentId: ${paymentId}`)
      return NextResponse.json({ ok: true })
    }

    // ── PAYMENT_OVERDUE ──────────────────────────────────────────────────────
    if (event === 'PAYMENT_OVERDUE') {
      await prisma.cobrancaAsaas.updateMany({
        where: { asaasId: paymentId },
        data:  { status: 'OVERDUE', atualizadoEm: new Date() },
      })

      let cobranca = await prisma.cobrancaAsaas.findFirst({
        where:  { asaasId: paymentId },
        select: { clienteId: true, valor: true, vencimento: true },
      })

      // M3: Se a cobrança não existe localmente (ex: PAYMENT_CREATED foi perdido),
      // tenta encontrar o cliente pelo customerId e criar o registro para marcar inadimplência.
      if (!cobranca) {
        const clienteRef = await prisma.cliente.findFirst({
          where:  { asaasCustomerId: payment.customer },
          select: { id: true, formaPagamento: true },
        })
        if (clienteRef) {
          const criada = await prisma.cobrancaAsaas.upsert({
            where:  { asaasId: paymentId },
            create: {
              asaasId:        paymentId,
              clienteId:      clienteRef.id,
              valor:          payment.value,
              vencimento:     new Date(payment.dueDate),
              status:         'OVERDUE',
              formaPagamento: mapBillingTypeToLocal(payment.billingType),
              invoiceUrl:     payment.invoiceUrl ?? null,
            },
            update: { status: 'OVERDUE', invoiceUrl: payment.invoiceUrl ?? null, atualizadoEm: new Date() },
          })
          cobranca = { clienteId: criada.clienteId, valor: criada.valor, vencimento: criada.vencimento }
          console.warn(
            `[Asaas webhook] PAYMENT_OVERDUE criou cobrança ausente localmente — ` +
            `paymentId: ${paymentId}, clienteId: ${clienteRef.id}`,
          )
          Sentry.captureMessage('[Asaas webhook] PAYMENT_OVERDUE: cobrança não existia localmente — criada agora', {
            level: 'warning',
            tags:  { module: 'asaas-webhook', operation: 'PAYMENT_OVERDUE' },
            extra: { paymentId, customerId: payment.customer, clienteId: clienteRef.id },
          })
        } else {
          console.warn(
            `[Asaas webhook] PAYMENT_OVERDUE ignorado: paymentId ${paymentId} sem cobrança ` +
            `e customer ${payment.customer} não mapeado localmente.`,
          )
          Sentry.captureMessage('[Asaas webhook] PAYMENT_OVERDUE ignorado: customer não mapeado', {
            level: 'warning',
            tags:  { module: 'asaas-webhook', operation: 'PAYMENT_OVERDUE' },
            extra: { paymentId, customerId: payment.customer },
          })
        }
      }

      if (cobranca) {
        const cliente = await prisma.cliente.findUnique({
          where:  { id: cobranca.clienteId },
          select: { id: true, nome: true, status: true },
        })

        if (
          cliente &&
          cliente.status !== 'inadimplente' &&
          cliente.status !== 'suspenso' &&
          cliente.status !== 'cancelado'
        ) {
          // BUG 4: usa cliente.status real em vez de hardcoded 'ativo'.
          // O cliente pode ter qualquer status válido (ex: 'ativo') antes de ficar inadimplente.
          const statusAnterior = cliente.status as StatusCliente

          const [clienteAtualizado, historicoInad] = await Promise.all([
            prisma.cliente.update({
              where: { id: cliente.id },
              data:  {
                status:      'inadimplente',
                inativadoEm: new Date(),
                asaasStatus: 'OVERDUE',
              },
            }),
            prisma.clienteStatusHistorico.create({
              data: {
                clienteId:    cliente.id,
                statusAntes:  statusAnterior,
                statusDepois: 'inadimplente',
                motivo:       `Boleto vencido em ${new Date(payment.dueDate).toLocaleDateString('pt-BR')} — Asaas`,
              },
            }),
          ])
          indexarAsync('cliente', clienteAtualizado)
          indexarAsync('statusHistorico', { ...historicoInad, criadoEm: new Date() })

          await notificarClienteInadimplente({
            clienteId:    cliente.id,
            nomeCliente:  cliente.nome,
            valorVencido: Number(cobranca.valor),
            vencimento:   cobranca.vencimento,
          })

          console.log(
            `[Asaas webhook] PAYMENT_OVERDUE — cliente ${cliente.id} marcado inadimplente. ` +
            `Valor: R$ ${cobranca.valor}, vencimento: ${payment.dueDate}`,
          )
        }
      }

      return NextResponse.json({ ok: true })
    }

    // Evento não tratado — retorna 200 para não gerar retentativas desnecessárias
    return NextResponse.json({ ok: true, ignored: true })

  } catch (err) {
    // BUG 2: captura qualquer exceção não tratada com Sentry e retorna 200.
    // Retornar 500 causaria retentativas do Asaas que poderiam duplicar dados.
    console.error(`[Asaas webhook] Erro inesperado ao processar evento ${event}:`, err)
    Sentry.captureException(err, {
      tags:  { module: 'asaas-webhook', operation: event },
      extra: { paymentId, event },
    })
    // Retorna 200 intencionalmente para evitar retentativas que causam estado inconsistente.
    // O erro está no Sentry para investigação.
    return NextResponse.json({ ok: true, error: 'internal_error_logged' })
  }
}
