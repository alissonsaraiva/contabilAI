/**
 * Webhook ZapSign — recebe eventos de assinatura.
 * Configurar em: ZapSign → Configurações → Integrações → Webhooks
 * URL: https://seudominio/api/webhooks/zapsign
 * Evento: doc_signed (quando todos assinam, status = "signed")
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

  if (contrato.status === 'assinado') {
    return NextResponse.json({ ok: true, already: true })
  }

  const agora = new Date()

  await prisma.contrato.update({
    where: { id: contrato.id },
    data: {
      status: 'assinado',
      assinadoEm: agora,
      ...(payload.signed_file && { pdfUrl: payload.signed_file }),
    },
  })

  await prisma.lead.update({
    where: { id: contrato.leadId },
    data: { status: 'assinado', stepAtual: 6 },
  })

  // ── Converte lead em cliente + empresa automaticamente ───────────────────
  const lead = contrato.lead
  const dados = lead.dadosJson as Record<string, unknown> | null
  const nome = (dados?.['Nome completo'] as string | undefined) ?? lead.contatoEntrada
  const cpf = dados?.['CPF'] as string | undefined
  const email = (dados?.['E-mail'] as string | undefined) ?? lead.contatoEntrada
  const telefone = (dados?.['Telefone'] as string | undefined) ?? lead.contatoEntrada

  const simTipo = (dados?.simulador as Record<string, string> | undefined)?.tipo
  const tipoContribuinte = simTipo === 'liberal' ? 'pf' as const : 'pj' as const
  const profissao = dados?.['Profissão'] as string | undefined

  if (nome && cpf && email) {
    try {
      let cliente = await prisma.cliente.findUnique({ where: { leadId: lead.id } })
      if (!cliente) {
        const plano = lead.planoTipo ?? 'essencial'
        try {
          const resultado = await prisma.$transaction(async (tx) => {
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
            return r
          })
          cliente = await prisma.cliente.findUnique({ where: { id: resultado.clienteId } })
        } catch (err: unknown) {
          if ((err as { code?: string })?.code === 'P2002') {
            cliente = await prisma.cliente.findUnique({ where: { leadId: lead.id } })
          } else {
            throw err
          }
        }
      } else {
        await prisma.contrato.update({ where: { id: contrato.id }, data: { clienteId: cliente.id } })
      }

      if (cliente) {
        indexarAsync('cliente', cliente)
        import('@/lib/email/boas-vindas')
          .then(({ enviarBoasVindas }) =>
            enviarBoasVindas({ id: cliente!.id, nome: cliente!.nome, email: cliente!.email })
          )
          .catch((err) => console.error('[zapsign webhook] Erro ao enviar boas-vindas:', err))
        import('@/lib/services/asaas-sync')
          .then(({ provisionarClienteAsaas }) => provisionarClienteAsaas(cliente!.id))
          .catch((err) => console.error('[zapsign webhook] Erro ao provisionar Asaas:', err))
      }
    } catch (err) {
      console.error('[zapsign webhook] Erro ao converter lead em cliente:', err)
      Sentry.captureException(err, { tags: { module: 'webhook-zapsign', operation: 'lead-to-cliente' } })
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  return NextResponse.json({ ok: true })
}
