/**
 * Webhook ZapSign — recebe eventos de assinatura.
 * Configurar em: ZapSign → Configurações → Integrações → Webhooks
 * URL: https://seudominio/api/webhooks/zapsign?secret={zapsignWebhookSecret}
 * Evento: doc_signed (quando todos assinam, status = "signed")
 *
 * DESIGN DE IDEMPOTÊNCIA:
 * Todas as escritas no banco (contrato, lead, cliente, empresa) ocorrem dentro
 * de uma única $transaction. Se qualquer parte falhar, nada é commitado e o
 * webhook retorna 500, permitindo que a ZapSign reenvie e o sistema retente.
 * O check de status DENTRO da transaction previne duplo-processamento em retentativas.
 */
import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { criarClienteDeContrato } from '@/lib/clientes/criar-de-contrato'
import type { PlanoTipo, FormaPagamento } from '@prisma/client'

type ZapSignWebhookPayload = {
  event_type: string
  token: string        // doc token
  status: 'pending' | 'signed'
  name: string
  signed_file?: string | null
  signer_who_signed?: {
    token: string
    name: string
    email: string
    status: string
    signed_at: string
  }
  signers?: Array<{
    token: string
    name: string
    email: string
    status: string
    signed_at: string | null
  }>
}

async function verificarSecret(req: Request): Promise<boolean> {
  const escritorio = await prisma.escritorio.findFirst({ select: { zapsignWebhookSecret: true } })
  const secret = escritorio?.zapsignWebhookSecret
  if (!secret) {
    // Secret não configurado — bloqueia para evitar fraudes.
    // Configure em: Configurações → Integrações → ZapSign Webhook Secret.
    console.error('[ZapSign webhook] ERRO: zapsignWebhookSecret não configurado — requisição bloqueada por segurança.')
    Sentry.captureMessage('ZapSign webhook: secret não configurado — requisição bloqueada', {
      level: 'warning',
      tags: { module: 'webhook-zapsign', operation: 'validar-secret' },
    })
    return false
  }
  const { searchParams } = new URL(req.url)
  const tokenRecebido = searchParams.get('secret')
  return tokenRecebido === secret
}

export async function POST(req: Request) {
  const autorizado = await verificarSecret(req)
  if (!autorizado) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let payload: ZapSignWebhookPayload
  try {
    payload = await req.json() as ZapSignWebhookPayload
  } catch {
    return NextResponse.json({ error: 'payload inválido' }, { status: 400 })
  }

  // Só processa doc_signed quando todos os signatários assinaram (status === "signed")
  if (payload.event_type !== 'doc_signed' || payload.status !== 'signed') {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const docToken = payload.token
  if (!docToken) return NextResponse.json({ error: 'doc token ausente' }, { status: 400 })

  const contrato = await prisma.contrato.findFirst({
    where: { zapsignDocToken: docToken },
    include: { lead: true },
  })

  if (!contrato) {
    return NextResponse.json({ ok: true, found: false })
  }

  // Já processado com sucesso anteriormente — idempotência segura.
  // Se o cliente existe, retorna 200. Se não existe (falha anterior), continua.
  if (contrato.status === 'assinado') {
    const clienteJaExiste = await prisma.cliente.findUnique({ where: { leadId: contrato.leadId } })
    if (clienteJaExiste) return NextResponse.json({ ok: true, already: true })
    // Cliente não foi criado em tentativa anterior — prossegue para retentar a conversão.
    console.warn(`[ZapSign webhook] Contrato ${contrato.id} já assinado mas cliente não existe — retentando conversão`)
    Sentry.captureMessage('ZapSign webhook: contrato assinado sem cliente correspondente — retentando conversão', {
      level: 'warning',
      tags: { module: 'webhook-zapsign', operation: 'conversao-pendente' },
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
  // A transação ainda marca o contrato como assinado, mas o cliente não é criado.
  if (!cpf) {
    console.error(`[ZapSign webhook] CPF ausente no lead ${lead.id} — cliente não será criado automaticamente`)
    Sentry.captureMessage('ZapSign webhook: CPF ausente no lead — cliente não criado automaticamente', {
      level: 'error',
      tags: { module: 'webhook-zapsign', operation: 'dados-incompletos' },
      extra: { leadId: lead.id, nome, email, camposFaltantes: ['cpf'] },
    })
  }

  // ── Transação atômica: tudo ou nada ─────────────────────────────────────────
  // Marcar contrato/lead como assinado E criar cliente ocorrem na mesma transaction.
  // Se criar o cliente falhar, o contrato NÃO é marcado como assinado,
  // o webhook retorna 500, e a ZapSign retenta automaticamente.
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
          ...(payload.signed_file && { pdfUrl: payload.signed_file }),
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
    // Busca o cliente existente para continuar os efeitos colaterais.
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
      console.error('[ZapSign webhook] Falha na transação de conversão lead→cliente:', err)
      Sentry.captureException(err, {
        tags: { module: 'webhook-zapsign', operation: 'transaction-lead-to-cliente' },
        extra: { contratoId: contrato.id, leadId: lead.id },
      })
      // Retorna 500 para que a ZapSign reenvie o webhook e o sistema retente.
      return NextResponse.json({ error: 'Erro interno ao processar assinatura' }, { status: 500 })
    }
  }

  // ── Efeitos colaterais (fora da transaction — não críticos para idempotência) ─
  if (clienteId) {
    const clienteFinal = await prisma.cliente.findUnique({ where: { id: clienteId } })
    if (clienteFinal) {
      indexarAsync('cliente', clienteFinal)

      import('@/lib/email/boas-vindas')
        .then(({ enviarBoasVindas }) =>
          enviarBoasVindas({ id: clienteFinal.id, nome: clienteFinal.nome, email: clienteFinal.email }),
        )
        .catch((err) => {
          console.error('[ZapSign webhook] Erro ao enviar boas-vindas:', err)
          Sentry.captureException(err, {
            tags:  { module: 'webhook-zapsign', operation: 'boas-vindas' },
            extra: { clienteId: clienteFinal.id },
          })
        })

      import('@/lib/services/asaas-sync')
        .then(({ provisionarClienteAsaas }) => provisionarClienteAsaas(clienteFinal.id))
        .catch((err) => {
          console.error('[ZapSign webhook] Erro ao provisionar Asaas:', err)
          Sentry.captureException(err, {
            tags:  { module: 'webhook-zapsign', operation: 'provisionar-asaas' },
            extra: { clienteId: clienteFinal.id },
          })
        })
    }
  }

  return NextResponse.json({ ok: true })
}
