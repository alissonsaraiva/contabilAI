/**
 * Webhook ZapSign — recebe eventos de assinatura.
 * Configurar em: ZapSign → Configurações → Integrações → Webhooks
 * URL: https://seudominio/api/webhooks/zapsign
 * Header obrigatório: X-ZapSign-Secret: {zapsignWebhookSecret}
 * Evento: doc_signed (quando todos assinam, status = "signed")
 *
 * DESIGN DE IDEMPOTÊNCIA:
 * Todas as escritas no banco (contrato, lead, cliente, empresa) ocorrem dentro
 * de uma única $transaction. Se qualquer parte falhar, nada é commitado e o
 * webhook retorna 500, permitindo que a ZapSign reenvie e o sistema retente.
 * O check de status DENTRO da transaction previne duplo-processamento em retentativas.
 *
 * AUTENTICAÇÃO:
 * Secret validado via header X-ZapSign-Secret (não query param) para evitar
 * exposição em logs de acesso e URLs de servidor.
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
    console.error('[ZapSign webhook] ERRO: zapsignWebhookSecret não configurado — requisição bloqueada por segurança.')
    Sentry.captureMessage('ZapSign webhook: secret não configurado — requisição bloqueada', {
      level: 'warning',
      tags: { module: 'webhook-zapsign', operation: 'validar-secret' },
    })
    return false
  }
  // Autenticação exclusiva por header X-ZapSign-Secret.
  // Configurar no painel ZapSign: Configurações → Integrações → Webhooks → adicionar header.
  const tokenRecebido = req.headers.get('x-zapsign-secret')
  return tokenRecebido === secret
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validarDadosConversao(dados: {
  nome?: string
  cpf?: string
  email?: string
  telefone?: string
}): string[] {
  const faltando: string[] = []
  if (!dados.nome?.trim()) faltando.push('nome')
  const cpfDigits = (dados.cpf ?? '').replace(/\D/g, '')
  if (cpfDigits.length !== 11) faltando.push('cpf')
  if (!dados.email || !EMAIL_REGEX.test(dados.email)) faltando.push('email')
  const telDigits = (dados.telefone ?? '').replace(/\D/g, '')
  if (telDigits.length < 10) faltando.push('telefone')
  return faltando
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
  // 'liberal' = autônomo PF; 'nao_abri' = quer abrir empresa (ainda PF até ter CNPJ)
  const tipoContribuinte = (simTipo === 'liberal' || simTipo === 'nao_abri') ? 'pf' as const : 'pj' as const
  const profissao = dados?.['Profissão'] as string | undefined

  // Validação completa de dados obrigatórios antes de tentar criar o cliente
  const camposFaltando = validarDadosConversao({ nome, cpf, email, telefone })
  if (camposFaltando.length > 0) {
    console.error(`[ZapSign webhook] Dados obrigatórios ausentes no lead ${lead.id}:`, camposFaltando)
    Sentry.captureMessage('ZapSign webhook: dados obrigatórios ausentes — cliente não será criado', {
      level: 'error',
      tags: { module: 'webhook-zapsign', operation: 'dados-incompletos' },
      // Não incluir nome/email/cpf no Sentry (dados pessoais — LGPD)
      extra: { leadId: lead.id, camposFaltando },
    })

    // Marca contrato como assinado mas registra o erro para acompanhamento manual
    await prisma.$transaction([
      prisma.contrato.update({
        where: { id: contrato.id },
        data: {
          status: 'assinado',
          assinadoEm: agora,
          ...(payload.signed_file && { pdfUrl: payload.signed_file }),
        },
      }),
      prisma.lead.update({
        where: { id: contrato.leadId },
        data: { status: 'assinado', stepAtual: 6 },
      }),
    ])

    // Notifica o contador via Sentry (alerta operacional)
    Sentry.captureMessage('ZapSign: lead assinado sem conversão — requer intervenção manual', {
      level: 'error',
      tags: { module: 'webhook-zapsign', operation: 'conversao-manual-necessaria' },
      extra: { leadId: lead.id, contratoId: contrato.id, camposFaltando },
    })

    return NextResponse.json({ ok: true, clienteCriado: false, motivo: 'dados-incompletos' })
  }

  // ── Transação atômica: tudo ou nada ─────────────────────────────────────────
  let clienteId: string | null = null

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // Check de idempotência DENTRO da transaction para prevenir race conditions.
      const contratoAtual = await tx.contrato.findUnique({
        where: { id: contrato.id },
        select: { status: true, clienteId: true },
      })
      if (contratoAtual?.status === 'assinado') {
        // Já foi processado por outra requisição concorrente — retorna o clienteId existente.
        return { jaProcessado: true, clienteId: contratoAtual.clienteId }
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

      // Verifica se cliente já existe (caso de reprocessamento)
      const clienteExistente = await tx.cliente.findUnique({ where: { leadId: lead.id } })
      if (clienteExistente) {
        await tx.contrato.update({ where: { id: contrato.id }, data: { clienteId: clienteExistente.id } })
        return { jaProcessado: false, clienteId: clienteExistente.id }
      }

      const plano = lead.planoTipo ?? 'essencial'
      const r = await criarClienteDeContrato(tx, {
        leadId: lead.id, nome: nome!, cpf: cpf!, email: email!, telefone,
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
      clienteId = resultado.clienteId
      if (!clienteId) return NextResponse.json({ ok: true, already: true })
    } else {
      clienteId = resultado.clienteId
    }
  } catch (err: unknown) {
    // P2002 = unique constraint — cliente já foi criado por corrida concorrente.
    // Busca dentro de uma transaction para garantir consistência.
    if ((err as { code?: string })?.code === 'P2002') {
      console.warn('[ZapSign webhook] P2002 — cliente já existe, recuperando estado consistente')
      try {
        const [clienteRecuperado, contratoAtualizado] = await prisma.$transaction([
          prisma.cliente.findUnique({ where: { leadId: lead.id } }),
          prisma.contrato.findUnique({ where: { id: contrato.id }, select: { clienteId: true } }),
        ])
        clienteId = clienteRecuperado?.id ?? contratoAtualizado?.clienteId ?? null
        // Vincula o contrato ao cliente se ainda não estiver vinculado
        if (clienteId && !contratoAtualizado?.clienteId) {
          await prisma.contrato.update({
            where: { id: contrato.id },
            data: { clienteId },
          }).catch((vinculoErr) => {
            console.error('[ZapSign webhook] Falha ao vincular contrato ao cliente recuperado:', vinculoErr)
          })
        }
      } catch (recuperacaoErr) {
        console.error('[ZapSign webhook] Falha ao recuperar estado após P2002:', recuperacaoErr)
        Sentry.captureException(recuperacaoErr, {
          tags: { module: 'webhook-zapsign', operation: 'recuperacao-p2002' },
          extra: { contratoId: contrato.id, leadId: lead.id },
        })
        return NextResponse.json({ error: 'Erro interno ao processar assinatura' }, { status: 500 })
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

      // Migra histórico de onboarding do lead para o escopo do cliente
      // — torna dados do formulário, simulador e contrato visíveis no CRM e portal
      indexarAsync('leadMigrado', {
        lead: {
          id:             lead.id,
          contatoEntrada: lead.contatoEntrada,
          canal:          lead.canal,
          planoTipo:      lead.planoTipo,
          dadosJson:      lead.dadosJson,
          contratoPlano:      contrato.planoTipo ?? null,
          contratoValor:      typeof contrato.valorMensal === 'number' ? contrato.valorMensal : null,
          contratoVencimento: contrato.vencimentoDia ?? null,
          contratoFormaPagamento: contrato.formaPagamento ?? null,
          contratoAssinadoEm:     agora,
        },
        clienteId,
      })

      // E-mail de boas-vindas com magic link
      import('@/lib/email/boas-vindas')
        .then(({ enviarBoasVindas }) =>
          enviarBoasVindas({ id: clienteFinal.id, nome: clienteFinal.nome, email: clienteFinal.email }),
        )
        .catch((err) => {
          console.error('[ZapSign webhook] Erro ao enviar boas-vindas por e-mail:', err)
          Sentry.captureException(err, {
            tags:  { module: 'webhook-zapsign', operation: 'boas-vindas-email' },
            extra: { clienteId: clienteFinal.id },
          })
        })

      // WhatsApp de boas-vindas (complementa o e-mail que pode ir para spam)
      import('@/lib/whatsapp/boas-vindas')
        .then(({ enviarBoasVindasWhatsApp }) =>
          enviarBoasVindasWhatsApp({
            id:        clienteFinal.id,
            nome:      clienteFinal.nome,
            telefone:  clienteFinal.telefone,
            empresaId: clienteFinal.empresaId ?? '',
          }),
        )
        .catch((err) => {
          console.error('[ZapSign webhook] Erro ao enviar boas-vindas por WhatsApp:', err)
          Sentry.captureException(err, {
            tags:  { module: 'webhook-zapsign', operation: 'boas-vindas-whatsapp' },
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
