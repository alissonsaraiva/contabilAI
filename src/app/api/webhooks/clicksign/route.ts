/**
 * Webhook ClickSign — recebe eventos de assinatura.
 * Configurar em: ClickSign → Configurações → Webhooks
 * URL: https://seudominio/api/webhooks/clicksign
 * Evento: document:auto_closed (todos assinaram e documento fechado automaticamente)
 *
 * DESIGN DE IDEMPOTÊNCIA:
 * Todas as escritas no banco (contrato, lead, cliente, empresa) ocorrem dentro
 * de uma única $transaction. Se qualquer parte falhar, nada é commitado e o
 * webhook retorna 500, permitindo que a ClickSign reenvie e o sistema retente.
 * O check de status DENTRO da transaction previne duplo-processamento em retentativas.
 */
import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { criarClienteDeContrato } from '@/lib/clientes/criar-de-contrato'
import type { PlanoTipo, FormaPagamento } from '@prisma/client'

async function verificarHmac(req: Request, rawBody: string): Promise<boolean> {
  const escritorio = await prisma.escritorio.findFirst({ select: { clicksignHmacSecret: true } })
  const secret = escritorio?.clicksignHmacSecret
  if (!secret) {
    // Secret não configurado — aceita para não bloquear bootstrapping, mas alerta.
    Sentry.captureMessage('ClickSign webhook: HMAC secret não configurado — requisição aceita sem validação', {
      level: 'warning',
      tags: { module: 'webhook-clicksign', operation: 'hmac-bypass' },
    })
    console.warn('[ClickSign webhook] AVISO: clicksignHmacSecret não configurado — webhook aceito sem validação HMAC. Configure em Configurações → Integrações.')
    return true
  }

  const assinatura = req.headers.get('X-Clicksign-Hmac-SHA256')
  if (!assinatura) return false

  const hmac = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  try {
    return timingSafeEqual(Buffer.from(hmac), Buffer.from(assinatura))
  } catch {
    return false
  }
}

// A ClickSign retorna downloads como OBJETO, não array.
type ClickSignWebhookPayload = {
  event: {
    name: string           // 'document:auto_closed' | 'document:signed' | etc.
    data: {
      document: {
        key: string
        status: string
        /**
         * Downloads retornados como objeto (não array).
         * signed_file_url: PDF com overlay da ClickSign (preferido)
         * original_file_url: PDF original sem overlay (fallback)
         */
        downloads?: {
          signed_file_url?: string
          original_file_url?: string
        }
        signers?: Array<{
          key: string
          email: string
          name: string
          signed_at?: string
        }>
      }
    }
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text()
  if (!(await verificarHmac(req, rawBody))) {
    return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 })
  }

  let payload: ClickSignWebhookPayload
  try {
    payload = JSON.parse(rawBody) as ClickSignWebhookPayload
  } catch {
    return NextResponse.json({ error: 'payload inválido' }, { status: 400 })
  }

  const eventName = payload.event?.name
  const doc = payload.event?.data?.document

  // Aceita tanto o formato REST quanto o formato legado da ClickSign
  const isAutoClose = eventName === 'document:auto_closed' || eventName === 'Event::AutoClose'
  if (!isAutoClose || !doc?.key) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const docKey = doc.key
  // Prefere PDF assinado (com overlay da ClickSign), fallback para original
  const signedFileUrl = doc.downloads?.signed_file_url ?? doc.downloads?.original_file_url ?? null

  const contrato = await prisma.contrato.findFirst({
    where: { clicksignKey: docKey },
    include: { lead: true },
  })

  if (!contrato) return NextResponse.json({ ok: true, found: false })

  // Já processado com sucesso anteriormente — idempotência segura.
  // Se o cliente existe, retorna 200. Se não existe (falha anterior), continua.
  if (contrato.status === 'assinado') {
    const clienteJaExiste = await prisma.cliente.findUnique({ where: { leadId: contrato.leadId } })
    if (clienteJaExiste) return NextResponse.json({ ok: true, already: true })
    // Cliente não foi criado em tentativa anterior — prossegue para retentar a conversão.
    console.warn(`[ClickSign webhook] Contrato ${contrato.id} já assinado mas cliente não existe — retentando conversão`)
    Sentry.captureMessage('ClickSign webhook: contrato assinado sem cliente correspondente — retentando conversão', {
      level: 'warning',
      tags: { module: 'webhook-clicksign', operation: 'conversao-pendente' },
      extra: { contratoId: contrato.id, leadId: contrato.leadId },
    })
  }

  const agora = new Date()
  const lead = contrato.lead
  const dados = lead.dadosJson as Record<string, unknown> | null
  const nome = (dados?.['Nome completo'] as string | undefined) ?? lead.contatoEntrada
  const cpf = dados?.['CPF'] as string | undefined
  const email = (dados?.['E-mail'] as string | undefined) ?? lead.contatoEntrada
  const telefone = (dados?.['Telefone'] as string | undefined) ?? lead.contatoEntrada

  const simTipo = (dados?.simulador as Record<string, string> | undefined)?.tipo
  const tipoContribuinte = simTipo === 'liberal' ? 'pf' as const : 'pj' as const
  const profissao = dados?.['Profissão'] as string | undefined

  // Alerta se dados obrigatórios para conversão estiverem ausentes.
  if (!cpf) {
    console.error(`[ClickSign webhook] CPF ausente no lead ${lead.id} — cliente não será criado automaticamente`)
    Sentry.captureMessage('ClickSign webhook: CPF ausente no lead — cliente não criado automaticamente', {
      level: 'error',
      tags: { module: 'webhook-clicksign', operation: 'dados-incompletos' },
      extra: { leadId: lead.id, nome, email, camposFaltantes: ['cpf'] },
    })
  }

  // ── Transação atômica: tudo ou nada ─────────────────────────────────────────
  // Marcar contrato/lead como assinado E criar cliente ocorrem na mesma transaction.
  // Se criar o cliente falhar, o contrato NÃO é marcado como assinado,
  // o webhook retorna 500, e a ClickSign retenta automaticamente.
  let clienteId: string | null = null

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // Check de idempotência DENTRO da transaction para prevenir race conditions.
      const contratoAtual = await tx.contrato.findUnique({
        where: { id: contrato.id },
        select: { status: true },
      })
      if (contratoAtual?.status === 'assinado') {
        // Já foi processado por outra requisição concorrente — não faz nada.
        return { jaProcessado: true, clienteId: null as string | null }
      }

      await tx.contrato.update({
        where: { id: contrato.id },
        data: {
          status: 'assinado',
          assinadoEm: agora,
          ...(signedFileUrl && { pdfUrl: signedFileUrl }),
        },
      })

      await tx.lead.update({
        where: { id: contrato.leadId },
        data: { status: 'assinado', stepAtual: 6 },
      })

      // Só cria o cliente se tiver os dados mínimos obrigatórios
      if (!nome || !cpf || !email) {
        return { jaProcessado: false, clienteId: null as string | null }
      }

      // Verifica se cliente já existe (caso de reprocessamento)
      const clienteExistente = await tx.cliente.findUnique({ where: { leadId: lead.id } })
      if (clienteExistente) {
        await tx.contrato.update({ where: { id: contrato.id }, data: { clienteId: clienteExistente.id } })
        return { jaProcessado: false, clienteId: clienteExistente.id }
      }

      const plano = lead.planoTipo ?? 'essencial'
      const r = await criarClienteDeContrato(tx, {
        leadId: lead.id, nome, cpf, email, telefone,
        planoTipo: plano as PlanoTipo,
        valorMensal: contrato.valorMensal,
        vencimentoDia: contrato.vencimentoDia,
        formaPagamento: contrato.formaPagamento as FormaPagamento,
        dataInicio: agora,
        tipoContribuinte,
        profissao,
        cnpj:         dados?.['CNPJ'] as string | undefined,
        razaoSocial:  dados?.['Razão Social'] as string | undefined,
        nomeFantasia: dados?.['Nome Fantasia'] as string | undefined,
        cidade:       dados?.['Cidade'] as string | undefined,
        responsavelId: lead.responsavelId,
      })
      await tx.contrato.update({ where: { id: contrato.id }, data: { clienteId: r.clienteId } })
      return { jaProcessado: false, clienteId: r.clienteId }
    })

    if (resultado.jaProcessado) {
      return NextResponse.json({ ok: true, already: true })
    }

    clienteId = resultado.clienteId
  } catch (err: unknown) {
    // P2002 = unique constraint — cliente já foi criado por corrida concorrente.
    if ((err as { code?: string })?.code === 'P2002') {
      const clienteRecuperado = await prisma.cliente.findUnique({ where: { leadId: lead.id } })
      clienteId = clienteRecuperado?.id ?? null
      // Vincula o contrato ao cliente se ainda não vinculado
      if (clienteId) {
        await prisma.contrato.update({
          where: { id: contrato.id },
          data: { clienteId },
        }).catch(() => { /* ignora se já vinculado */ })
      }
    } else {
      console.error('[ClickSign webhook] Falha na transação de conversão lead→cliente:', err)
      Sentry.captureException(err, {
        tags: { module: 'webhook-clicksign', operation: 'transaction-lead-to-cliente' },
        extra: { contratoId: contrato.id, leadId: lead.id },
      })
      // Retorna 500 para que a ClickSign reenvie o webhook e o sistema retente.
      return NextResponse.json({ error: 'Erro interno ao processar assinatura' }, { status: 500 })
    }
  }

  // ── Efeitos colaterais (fora da transaction — não críticos para idempotência) ─
  if (clienteId) {
    const clienteFinal = await prisma.cliente.findUnique({ where: { id: clienteId } })
    if (clienteFinal) {
      indexarAsync('cliente', clienteFinal)

      // Migra histórico de onboarding do lead para o escopo do cliente
      indexarAsync('leadMigrado', {
        lead: {
          id:             lead.id,
          contatoEntrada: lead.contatoEntrada,
          canal:          lead.canal,
          planoTipo:      lead.planoTipo,
          dadosJson:      lead.dadosJson,
          contratoPlano:          contrato.planoTipo ?? null,
          contratoValor:          typeof contrato.valorMensal === 'number' ? contrato.valorMensal : null,
          contratoVencimento:     contrato.vencimentoDia ?? null,
          contratoFormaPagamento: contrato.formaPagamento ?? null,
          contratoAssinadoEm:     agora,
        },
        clienteId,
      })

      import('@/lib/email/boas-vindas')
        .then(({ enviarBoasVindas }) =>
          enviarBoasVindas({ id: clienteFinal.id, nome: clienteFinal.nome, email: clienteFinal.email }),
        )
        .catch((err) => {
          console.error('[ClickSign webhook] Erro ao enviar boas-vindas:', err)
          Sentry.captureException(err, {
            tags:  { module: 'webhook-clicksign', operation: 'boas-vindas' },
            extra: { clienteId: clienteFinal.id },
          })
        })

      import('@/lib/services/asaas-sync')
        .then(({ provisionarClienteAsaas }) => provisionarClienteAsaas(clienteFinal.id))
        .catch((err) => {
          console.error('[ClickSign webhook] Erro ao provisionar Asaas:', err)
          Sentry.captureException(err, {
            tags:  { module: 'webhook-clicksign', operation: 'provisionar-asaas' },
            extra: { clienteId: clienteFinal.id },
          })
        })
    }
  }

  return NextResponse.json({ ok: true })
}
