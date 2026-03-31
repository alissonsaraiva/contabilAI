/**
 * Webhook Asaas — recebe eventos de pagamento.
 *
 * Configurar em: Asaas → Configurações → Integrações → Webhook
 * URL: https://seudominio/api/webhooks/asaas
 *
 * Eventos tratados:
 *   PAYMENT_RECEIVED  → marca pago, reativa cliente inadimplente
 *   PAYMENT_OVERDUE   → marca vencido, marca cliente como inadimplente, notifica equipe + WhatsApp
 *   PAYMENT_CREATED   → salva nova cobrança no banco local
 *   PAYMENT_UPDATED   → atualiza dados (data, valor) da cobrança local
 *   PAYMENT_DELETED   → cancela cobrança local
 *   PAYMENT_REFUNDED  → marca como reembolsado
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sincronizarCobrancas } from '@/lib/services/asaas-sync'
import { notificarClienteInadimplente } from '@/lib/notificacoes'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { sendPushToCliente } from '@/lib/push'
import type { AsaasStatusCobranca, FormaPagamento } from '@prisma/client'

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
    // Token não configurado → bloqueia por segurança
    console.error('[Asaas webhook] ERRO: asaasWebhookToken não configurado — requisição bloqueada.')
    return false
  }
  const recebido = req.headers.get('asaas-access-token') ?? req.headers.get('access_token')
  return recebido === token
}

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

function toBillingType(billingType: string): FormaPagamento {
  if (billingType === 'PIX') return 'pix'
  if (billingType === 'BOLETO') return 'boleto'
  return 'boleto' // fallback
}

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

  // ── PAYMENT_CREATED ────────────────────────────────────────────────────────
  if (event === 'PAYMENT_CREATED') {
    const cliente = await prisma.cliente.findFirst({
      where: { asaasCustomerId: payment.customer },
      select: { id: true, formaPagamento: true },
    })
    if (!cliente) return NextResponse.json({ ok: true, notFound: true })

    const forma = toBillingType(payment.billingType) ?? cliente.formaPagamento

    // Salva a cobrança básica — detalhes PIX/boleto chegam depois via enriquecimento
    await prisma.cobrancaAsaas.upsert({
      where:  { asaasId: paymentId },
      create: {
        asaasId:        paymentId,
        clienteId:      cliente.id,
        valor:          payment.value,
        vencimento:     new Date(payment.dueDate),
        status:         mapStatus(payment.status),
        formaPagamento: forma,
        linkBoleto:     payment.bankSlipUrl ?? payment.invoiceUrl ?? null,
      },
      update: {
        status:       mapStatus(payment.status),
        vencimento:   new Date(payment.dueDate),
        atualizadoEm: new Date(),
      },
    })

    // Enriquece com PIX/boleto em background (evita timeout do webhook)
    setImmediate(() => {
      prisma.cliente.findUnique({ where: { id: cliente.id }, select: { asaasSubscriptionId: true, formaPagamento: true } })
        .then(c => {
          if (c?.asaasSubscriptionId) {
            sincronizarCobrancas(cliente.id, c.asaasSubscriptionId, c.formaPagamento)
              .catch(err => console.error('[Asaas webhook] Erro ao sincronizar após PAYMENT_CREATED:', err))
          }
        })
        .catch(() => {/* silencia */})
    })

    return NextResponse.json({ ok: true })
  }

  // ── PAYMENT_UPDATED ────────────────────────────────────────────────────────
  if (event === 'PAYMENT_UPDATED') {
    await prisma.cobrancaAsaas.updateMany({
      where: { asaasId: paymentId },
      data: {
        valor:        payment.value,
        vencimento:   new Date(payment.dueDate),
        status:       mapStatus(payment.status),
        atualizadoEm: new Date(),
      },
    })
    return NextResponse.json({ ok: true })
  }

  // ── PAYMENT_DELETED ────────────────────────────────────────────────────────
  if (event === 'PAYMENT_DELETED') {
    await prisma.cobrancaAsaas.updateMany({
      where: { asaasId: paymentId },
      data:  { status: 'CANCELLED', atualizadoEm: new Date() },
    })
    return NextResponse.json({ ok: true })
  }

  // ── PAYMENT_REFUNDED ───────────────────────────────────────────────────────
  if (event === 'PAYMENT_REFUNDED') {
    await prisma.cobrancaAsaas.updateMany({
      where: { asaasId: paymentId },
      data:  { status: 'REFUNDED', atualizadoEm: new Date() },
    })
    return NextResponse.json({ ok: true })
  }

  // ── PAYMENT_CONFIRMED ──────────────────────────────────────────────────────
  if (event === 'PAYMENT_CONFIRMED') {
    const pagoEm = payment.paymentDate ? new Date(payment.paymentDate) : new Date()

    await prisma.cobrancaAsaas.updateMany({
      where: { asaasId: paymentId },
      data: {
        status:       'RECEIVED',
        pagoEm,
        valorPago:    payment.netValue ?? payment.value,
        atualizadoEm: new Date(),
      },
    })

    // Se o cliente estava inadimplente, reativa
    const cobrancaConf = await prisma.cobrancaAsaas.findFirst({
      where:  { asaasId: paymentId },
      select: { clienteId: true },
    })
    if (cobrancaConf) {
      const clienteConf = await prisma.cliente.findUnique({
        where:  { id: cobrancaConf.clienteId },
        select: { id: true, status: true },
      })
      if (clienteConf?.status === 'inadimplente') {
        const [atualizado, historico] = await Promise.all([
          prisma.cliente.update({
            where: { id: clienteConf.id },
            data: { status: 'ativo', reativadoEm: new Date(), asaasStatus: 'ACTIVE' },
          }),
          prisma.clienteStatusHistorico.create({
            data: {
              clienteId:    clienteConf.id,
              statusAntes:  'inadimplente',
              statusDepois: 'ativo',
              motivo:       'Pagamento confirmado via Asaas',
            },
          }),
        ])
        indexarAsync('cliente', atualizado)
        indexarAsync('statusHistorico', { ...historico, criadoEm: new Date() })
      } else if (clienteConf) {
        await prisma.cliente.update({
          where: { id: clienteConf.id },
          data:  { asaasStatus: 'ACTIVE' },
        })
      }

      // Push PWA — confirmação de pagamento
      sendPushToCliente(cobrancaConf.clienteId, {
        title: 'Pagamento confirmado ✅',
        body:  'Seu pagamento foi recebido com sucesso. Obrigado!',
        url:   '/portal/financeiro',
      }).catch(() => {/* silencia */})
    }

    return NextResponse.json({ ok: true })
  }

  // ── PAYMENT_RECEIVED ───────────────────────────────────────────────────────
  if (event === 'PAYMENT_RECEIVED') {
    const pagoEm = payment.paymentDate ? new Date(payment.paymentDate) : new Date()

    await prisma.cobrancaAsaas.updateMany({
      where: { asaasId: paymentId },
      data: {
        status:       'RECEIVED',
        pagoEm,
        valorPago:    payment.netValue ?? payment.value,
        atualizadoEm: new Date(),
      },
    })

    // Se o cliente estava inadimplente, reativa
    const cobranca = await prisma.cobrancaAsaas.findFirst({
      where:   { asaasId: paymentId },
      select:  { clienteId: true },
    })

    if (cobranca) {
      const cliente = await prisma.cliente.findUnique({
        where:  { id: cobranca.clienteId },
        select: { id: true, status: true },
      })

      if (cliente?.status === 'inadimplente') {
        const [atualizado, historico] = await Promise.all([
          prisma.cliente.update({
            where: { id: cliente.id },
            data: { status: 'ativo', reativadoEm: new Date(), asaasStatus: 'ACTIVE' },
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
      } else if (cliente) {
        await prisma.cliente.update({
          where: { id: cliente.id },
          data:  { asaasStatus: 'ACTIVE' },
        })
      }

      // Push PWA — confirmação de pagamento
      sendPushToCliente(cobranca.clienteId, {
        title: 'Pagamento confirmado ✅',
        body:  'Seu pagamento foi recebido com sucesso. Obrigado!',
        url:   '/portal/financeiro',
      }).catch(() => {/* silencia */})
    }

    return NextResponse.json({ ok: true })
  }

  // ── PAYMENT_OVERDUE ────────────────────────────────────────────────────────
  if (event === 'PAYMENT_OVERDUE') {
    await prisma.cobrancaAsaas.updateMany({
      where: { asaasId: paymentId },
      data:  { status: 'OVERDUE', atualizadoEm: new Date() },
    })

    const cobranca = await prisma.cobrancaAsaas.findFirst({
      where:   { asaasId: paymentId },
      select:  { clienteId: true, valor: true, vencimento: true },
    })

    if (cobranca) {
      const cliente = await prisma.cliente.findUnique({
        where:  { id: cobranca.clienteId },
        select: {
          id: true, nome: true, status: true, whatsapp: true,
          empresa: {
            select: {
              socios: {
                where:  { principal: true },
                select: { nome: true, whatsapp: true, telefone: true },
                take:   1,
              },
            },
          },
        },
      })

      if (cliente && cliente.status !== 'inadimplente' && cliente.status !== 'suspenso' && cliente.status !== 'cancelado') {
        // Marca inadimplente
        const [clienteAtualizado, historicoInad] = await Promise.all([
          prisma.cliente.update({
            where: { id: cliente.id },
            data: {
              status:       'inadimplente',
              inativadoEm:  new Date(),
              asaasStatus:  'OVERDUE',
            },
          }),
          prisma.clienteStatusHistorico.create({
            data: {
              clienteId:    cliente.id,
              statusAntes:  'ativo',
              statusDepois: 'inadimplente',
              motivo:       `Boleto vencido em ${new Date(payment.dueDate).toLocaleDateString('pt-BR')} — Asaas`,
            },
          }),
        ])
        indexarAsync('cliente', clienteAtualizado)
        indexarAsync('statusHistorico', { ...historicoInad, criadoEm: new Date() })

        // Notifica equipe no sino do CRM
        await notificarClienteInadimplente({
          clienteId:    cliente.id,
          nomeCliente:  cliente.nome,
          valorVencido: Number(cobranca.valor),
          vencimento:   cobranca.vencimento,
        })

        // Push PWA — aviso de cobrança vencida (fire-and-forget)
        const valorVenc = Number(cobranca.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        sendPushToCliente(cliente.id, {
          title: 'Cobrança em atraso',
          body:  `Você tem uma cobrança de ${valorVenc} vencida. Acesse o portal para regularizar.`,
          url:   '/portal/financeiro',
        }).catch(() => {/* silencia */})

        // WhatsApp — prioriza sócio principal, fallback para cliente.whatsapp
        const socioP    = cliente.empresa?.socios?.[0]
        const socioWA   = socioP?.whatsapp ?? socioP?.telefone ?? null
        const destWA    = socioWA ?? cliente.whatsapp ?? null
        const nomeDest  = socioP?.nome ?? cliente.nome

        if (destWA) {
          // Tenta enriquecer com PIX/boleto — primeiro tenta o banco local,
          // depois busca direto no Asaas caso o PAYMENT_CREATED ainda não tiver sincronizado
          let localCobranca = await prisma.cobrancaAsaas.findFirst({
            where:  { asaasId: paymentId },
            select: { linkBoleto: true, pixCopiaECola: true, formaPagamento: true },
          })

          if (localCobranca && !localCobranca.linkBoleto && !localCobranca.pixCopiaECola) {
            try {
              const { asaasGetPixQrCode, asaasGetBoletoBarcode } = await import('@/lib/asaas')
              if (localCobranca.formaPagamento === 'pix') {
                const qr = await asaasGetPixQrCode(paymentId)
                await prisma.cobrancaAsaas.updateMany({
                  where: { asaasId: paymentId },
                  data:  { pixQrCode: qr.encodedImage, pixCopiaECola: qr.payload },
                })
                localCobranca = { ...localCobranca, pixCopiaECola: qr.payload }
              } else {
                const bar = await asaasGetBoletoBarcode(paymentId)
                const link = payment.bankSlipUrl ?? payment.invoiceUrl ?? null
                await prisma.cobrancaAsaas.updateMany({
                  where: { asaasId: paymentId },
                  data:  { linkBoleto: link, codigoBarras: bar.identificationField },
                })
                localCobranca = { ...localCobranca, linkBoleto: link }
              }
            } catch (err) {
              console.error('[Asaas webhook] Não foi possível enriquecer cobrança para WA:', err)
            }
          }

          const detalhe = localCobranca?.linkBoleto
            ? `Acesse o boleto: ${localCobranca.linkBoleto}`
            : localCobranca?.pixCopiaECola
            ? `Copie o PIX:\n${localCobranca.pixCopiaECola}`
            : 'Entre em contato com nosso escritório para gerar a segunda via.'

          const valor    = Number(cobranca.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
          const dataVenc = new Date(payment.dueDate).toLocaleDateString('pt-BR')
          const mensagem = `Olá, ${nomeDest}! 👋\n\nIdentificamos que a cobrança de *${valor}* referente ao escritório contábil venceu em *${dataVenc}*.\n\n${detalhe}\n\nEm caso de dúvidas, estamos à disposição. 😊`

          Promise.all([
            import('@/lib/evolution'),
            import('@/lib/crypto'),
            prisma.escritorio.findFirst({
              select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
            }),
          ]).then(([{ sendText }, { decrypt, isEncrypted }, esc]) => {
            if (!esc?.evolutionApiUrl || !esc.evolutionApiKey || !esc.evolutionInstance) return
            const rawKey = esc.evolutionApiKey
            const evoCfg = {
              baseUrl:  esc.evolutionApiUrl,
              apiKey:   isEncrypted(rawKey) ? decrypt(rawKey) : rawKey,
              instance: esc.evolutionInstance,
            }
            const numero = destWA!.replace(/\D/g, '')
            return sendText(evoCfg, `${numero}@s.whatsapp.net`, mensagem)
              .then(() => prisma.interacao.create({
                data: {
                  clienteId: cliente.id,
                  tipo:      'whatsapp_saida',
                  origem:    'sistema',
                  titulo:    'Aviso de cobrança vencida (WhatsApp)',
                  conteudo:  mensagem,
                },
              }))
          }).catch(err => console.error('[Asaas webhook] Erro ao enviar WhatsApp inadimplência:', err))
        }
      }
    }

    return NextResponse.json({ ok: true })
  }

  // Evento não tratado — retorna 200 para não gerar retentativas desnecessárias
  return NextResponse.json({ ok: true, ignored: true })
}
