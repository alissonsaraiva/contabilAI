/**
 * Webhook ZapSign — recebe eventos de assinatura.
 * Configurar em: ZapSign → Configurações → Integrações → Webhooks
 * URL: https://seudominio/api/webhooks/zapsign
 * Evento: doc_signed (quando todos assinam, status = "signed")
 */
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import type { PlanoTipo, FormaPagamento, StatusCliente } from '@prisma/client'

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

export async function POST(req: Request) {
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

  // ── Converte lead em cliente automaticamente ──────────────────────────────
  const lead = contrato.lead
  const dados = lead.dadosJson as Record<string, string> | null
  const nome = dados?.['Nome completo'] ?? lead.contatoEntrada
  const cpf = dados?.['CPF']
  const email = dados?.['E-mail'] ?? lead.contatoEntrada
  const telefone = dados?.['Telefone'] ?? lead.contatoEntrada

  if (nome && cpf && email) {
    try {
      let cliente = await prisma.cliente.findUnique({ where: { leadId: lead.id } })
      if (!cliente) {
        const plano = lead.planoTipo ?? 'essencial'
        const valor = contrato.valorMensal
        const vencimento = contrato.vencimentoDia
        const formaPagamento = contrato.formaPagamento

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cliente = await prisma.$transaction(async (tx: any) => {
            const c = await tx.cliente.create({
              data: {
                leadId: lead.id,
                nome,
                cpf,
                email,
                telefone,
                whatsapp: telefone,
                planoTipo: plano as PlanoTipo,
                valorMensal: valor,
                vencimentoDia: vencimento,
                formaPagamento: formaPagamento as FormaPagamento,
                status: 'ativo' as StatusCliente,
                dataInicio: agora,
                ...(dados?.['CNPJ'] && { cnpj: dados['CNPJ'] }),
                ...(dados?.['Razão Social'] && { razaoSocial: dados['Razão Social'] }),
                ...(dados?.['Nome Fantasia'] && { nomeFantasia: dados['Nome Fantasia'] }),
                ...(dados?.['Cidade'] && { cidade: dados['Cidade'] }),
                ...(lead.responsavelId && { responsavelId: lead.responsavelId }),
              },
            })
            await tx.contrato.update({ where: { id: contrato.id }, data: { clienteId: c.id } })
            return c
          })
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
        // RAG + e-mail de boas-vindas em background (não bloqueia a resposta ao ZapSign)
        import('@/lib/rag/ingest')
          .then(({ indexarCliente }) => indexarCliente(cliente!))
          .catch(() => {})

        import('@/lib/email/boas-vindas')
          .then(({ enviarBoasVindas }) =>
            enviarBoasVindas({ id: cliente!.id, nome: cliente!.nome, email: cliente!.email })
          )
          .catch((err) => console.error('[zapsign webhook] Erro ao enviar boas-vindas:', err))
      }
    } catch (err) {
      console.error('[zapsign webhook] Erro ao converter lead em cliente:', err)
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  return NextResponse.json({ ok: true })
}
