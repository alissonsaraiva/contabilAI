import { prisma } from '@/lib/prisma'
import { uploadArquivo } from '@/lib/storage'
import { askAI } from '@/lib/ai/ask'
import type { EmailRecebido } from './imap'

export type ResultadoProcessamento = {
  interacaoId:  string
  clienteId:    string | null
  leadId:       string | null
  associado:    boolean   // true se identificou cliente ou lead pelo email
  sugestao:     string | null
  documentosId: string[]  // IDs dos Documentos criados a partir dos anexos
}

/**
 * Processa um email recebido:
 * 1. Tenta identificar remetente (cliente ou lead pelo campo email)
 * 2. Faz upload dos anexos no S3 e cria registros Documento
 * 3. Salva como Interacao email_recebido (com ou sem vínculo)
 * 4. Gera sugestão de resposta via Clara
 * 5. Indexa no RAG (fire-and-forget)
 *
 * Emails de remetentes não identificados:
 * - São salvos normalmente (sem clienteId/leadId)
 * - Aparecem na seção "Caixa de Entrada" do CRM
 * - Sem sugestão de resposta (não há contexto do cliente)
 */
export async function processarEmailRecebido(email: EmailRecebido): Promise<ResultadoProcessamento> {
  const { clienteId, leadId } = await identificarRemetente(email.de)
  const associado = !!(clienteId || leadId)

  // Upload dos anexos no S3 e criação de Documento
  const documentosId: string[] = []
  const anexosMeta: Array<{ nome: string; url: string; mimeType: string }> = []

  for (const anexo of email.anexos) {
    try {
      const timestamp = Date.now()
      const key = clienteId
        ? `clientes/${clienteId}/emails/${timestamp}_${anexo.nome}`
        : leadId
          ? `leads/${leadId}/emails/${timestamp}_${anexo.nome}`
          : `emails/desconhecidos/${timestamp}_${anexo.nome}`

      const url = await uploadArquivo(key, anexo.buffer, anexo.mimeType || 'application/octet-stream')

      // Cria registro Documento (somente se associado a cliente/lead)
      if (associado) {
        const doc = await prisma.documento.create({
          data: {
            nome:      anexo.nome,
            url,
            mimeType:  anexo.mimeType,
            tipo:      'email_anexo',
            status:    'recebido',
            clienteId: clienteId ?? undefined,
            leadId:    leadId    ?? undefined,
          } as any,
        })
        documentosId.push(doc.id)

        // Indexa o documento no RAG (crm + portal) fire-and-forget
        import('@/lib/rag/ingest')
          .then(({ indexarInteracao }) => {
            const interacaoFake = {
              id: `doc_email_${doc.id}`,
              tipo: 'documento_enviado' as const,
              titulo: anexo.nome,
              conteudo: `Anexo recebido por email: ${anexo.nome}`,
              clienteId: clienteId ?? null,
              leadId:    leadId    ?? null,
              criadoEm: new Date(),
            }
            return indexarInteracao(interacaoFake as any)
          })
          .catch(err => console.error('[processar] erro ao indexar anexo RAG:', err))
      }

      anexosMeta.push({ nome: anexo.nome, url, mimeType: anexo.mimeType })
    } catch {
      // Falha no upload de um anexo — continua com os demais
    }
  }

  // Sugestão de resposta (somente se identificou cliente ou lead)
  let sugestao: string | null = null
  if (associado) {
    sugestao = await gerarSugestao(email, clienteId, leadId)
  }

  // Salva interação
  const interacao = await prisma.interacao.create({
    data: {
      tipo:      'email_recebido',
      titulo:    email.assunto,
      conteudo:  email.corpo,
      clienteId: clienteId ?? undefined,
      leadId:    leadId    ?? undefined,
      metadados: {
        de:            email.de,
        nomeRemetente: email.nomeRemetente,
        assunto:       email.assunto,
        messageId:     email.messageId,
        dataEnvio:     email.dataEnvio.toISOString(),
        anexos:        anexosMeta,
        documentosId,
        sugestao,
      },
    } as any,
  })

  // Indexa conversa no RAG (fire-and-forget — somente se associado)
  if (associado) {
    import('@/lib/rag/ingest')
      .then(({ indexarInteracao }) => indexarInteracao(interacao))
      .catch(err => console.error('[processar] erro ao indexar interação RAG:', err))
  }

  return { interacaoId: interacao.id, clienteId, leadId, associado, sugestao, documentosId }
}

async function identificarRemetente(emailRemetente: string): Promise<{ clienteId: string | null; leadId: string | null }> {
  const emailNorm = emailRemetente.toLowerCase().trim()

  const cliente = await prisma.cliente.findFirst({
    where: { email: { equals: emailNorm, mode: 'insensitive' } },
    select: { id: true },
  })
  if (cliente) return { clienteId: cliente.id, leadId: null }

  const lead = await prisma.lead.findFirst({
    where: { dadosJson: { path: ['email'], equals: emailNorm } },
    select: { id: true },
  })
  if (lead) return { clienteId: null, leadId: lead.id }

  // Fallback: contatoEntrada pode ser email
  const leadContato = await prisma.lead.findFirst({
    where: { contatoEntrada: { equals: emailNorm, mode: 'insensitive' } },
    select: { id: true },
  })
  if (leadContato) return { clienteId: null, leadId: leadContato.id }

  return { clienteId: null, leadId: null }
}

async function gerarSugestao(
  email: EmailRecebido,
  clienteId: string | null,
  leadId: string | null,
): Promise<string | null> {
  try {
    const context = clienteId
      ? { escopo: 'cliente+global' as const, clienteId }
      : leadId
        ? { escopo: 'lead+global' as const, leadId }
        : { escopo: 'global' as const }

    const systemExtra = [
      'EMAIL RECEBIDO — gere uma sugestão de resposta profissional e objetiva para o contador enviar.',
      `De: ${email.nomeRemetente} <${email.de}>`,
      `Assunto: ${email.assunto}`,
      email.anexos.length > 0
        ? `Anexos recebidos: ${email.anexos.map(a => a.nome).join(', ')}`
        : null,
    ].filter(Boolean).join('\n')

    const { resposta } = await askAI({
      pergunta:   `Conteúdo do email:\n\n${email.corpo}`,
      context,
      feature:    'crm',
      systemExtra,
      maxTokens:  512,
    })

    return resposta
  } catch {
    return null
  }
}
