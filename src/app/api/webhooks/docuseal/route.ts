/**
 * Webhook DocuSeal — recebe eventos de assinatura.
 * Configurar em: DocuSeal → Settings → Webhooks → URL: https://seudominio/api/webhooks/docuseal
 * Eventos: submission.completed
 */
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import type { PlanoTipo, FormaPagamento, StatusCliente } from '@prisma/client'

type DocuSealWebhookPayload = {
  event_type: string
  timestamp: string
  data: {
    id: number           // submission ID
    status: string
    template_id?: number
    submitters?: Array<{ email: string; name: string; signed_at?: string }>
  }
}

export async function POST(req: Request) {
  let payload: DocuSealWebhookPayload
  try {
    payload = await req.json() as DocuSealWebhookPayload
  } catch {
    return NextResponse.json({ error: 'payload inválido' }, { status: 400 })
  }

  // Aceita submission.completed (todos assinaram) e form.completed (cada assinante)
  // Para um único signatário, form.completed = submission.completed — aceitamos os dois
  if (!['submission.completed', 'form.completed'].includes(payload.event_type)) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const submissionId = payload.data?.id
  if (!submissionId) return NextResponse.json({ error: 'submission id ausente' }, { status: 400 })

  const contrato = await prisma.contrato.findFirst({
    where: { docusealSubmissionId: submissionId },
    include: { lead: true },
  })

  if (!contrato) {
    // Pode ser de outro sistema — não retorna erro
    return NextResponse.json({ ok: true, found: false })
  }

  if (contrato.status === 'assinado') {
    return NextResponse.json({ ok: true, already: true })
  }

  const agora = new Date()

  await prisma.contrato.update({
    where: { id: contrato.id },
    data: { status: 'assinado', assinadoEm: agora },
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
        // RAG + e-mail de boas-vindas em background (não bloqueia a resposta ao DocuSeal)
        import('@/lib/rag/ingest')
          .then(({ indexarCliente }) => indexarCliente(cliente!))
          .catch(() => {})

        import('@/lib/email/boas-vindas')
          .then(({ enviarBoasVindas }) =>
            enviarBoasVindas({ id: cliente!.id, nome: cliente!.nome, email: cliente!.email })
          )
          .catch((err) => console.error('[docuseal webhook] Erro ao enviar boas-vindas:', err))
      }
    } catch (err) {
      console.error('[docuseal webhook] Erro ao converter lead em cliente:', err)
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  return NextResponse.json({ ok: true })
}
