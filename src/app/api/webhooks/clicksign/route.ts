/**
 * Webhook ClickSign — recebe eventos de assinatura.
 * Configurar em: ClickSign → Configurações → Webhooks
 * URL: https://seudominio/api/webhooks/clicksign
 * Evento: document:auto_closed (todos assinaram e documento fechado automaticamente)
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
  if (!secret) return true // sem secret configurado → aceita (para não bloquear antes de configurar)

  const assinatura = req.headers.get('X-Clicksign-Hmac-SHA256')
  if (!assinatura) return false

  const hmac = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  try {
    return timingSafeEqual(Buffer.from(hmac), Buffer.from(assinatura))
  } catch {
    return false
  }
}

type ClickSignWebhookPayload = {
  event: {
    name: string           // 'document:auto_closed' | 'document:signed' | etc.
    data: {
      document: {
        key: string
        status: string
        downloads?: { url?: string }[]
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

  const contrato = await prisma.contrato.findFirst({
    where: { clicksignKey: docKey },
    include: { lead: true },
  })

  if (!contrato) return NextResponse.json({ ok: true, found: false })
  if (contrato.status === 'assinado') return NextResponse.json({ ok: true, already: true })

  const agora = new Date()
  const signedFileUrl = doc.downloads?.[0]?.url ?? null

  await prisma.contrato.update({
    where: { id: contrato.id },
    data: {
      status: 'assinado',
      assinadoEm: agora,
      ...(signedFileUrl && { pdfUrl: signedFileUrl }),
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

  // Infere tipo de contribuinte a partir do simulador: 'liberal' = PF
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
          .catch((err) => console.error('[clicksign webhook] Erro ao enviar boas-vindas:', err))
        import('@/lib/services/asaas-sync')
          .then(({ provisionarClienteAsaas }) => provisionarClienteAsaas(cliente!.id))
          .catch((err) => console.error('[clicksign webhook] Erro ao provisionar Asaas:', err))
      }
    } catch (err) {
      console.error('[clicksign webhook] Erro ao converter lead em cliente:', err)
      Sentry.captureException(err, { tags: { module: 'webhook-clicksign', operation: 'lead-to-cliente' } })
    }
  }

  return NextResponse.json({ ok: true })
}
