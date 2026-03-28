import { prisma } from '@/lib/prisma'
import { criarDocumento } from '@/lib/services/documentos'
import { registrarInteracao } from '@/lib/services/interacoes'
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
 * 2. Faz upload dos anexos no S3 e cria registros Documento via criarDocumento()
 * 3. Salva como Interacao email_recebido via registrarInteracao()
 * 4. Gera sugestão de resposta via Clara
 *
 * Emails de remetentes não identificados:
 * - São salvos normalmente (sem clienteId/leadId)
 * - Aparecem na seção "Caixa de Entrada" do CRM
 * - Sem sugestão de resposta (não há contexto do cliente)
 */
export async function processarEmailRecebido(email: EmailRecebido): Promise<ResultadoProcessamento> {
  const { clienteId, leadId } = await identificarRemetente(email.de)
  const associado = !!(clienteId || leadId)

  // Upload dos anexos e criação de Documento via service unificado
  const documentosId: string[] = []
  const anexosMeta: Array<{ nome: string; url: string; mimeType: string }> = []

  for (const anexo of email.anexos) {
    try {
      if (associado) {
        // Usa criarDocumento() — S3 + banco + RAG automático
        const doc = await criarDocumento({
          clienteId: clienteId ?? undefined,
          leadId:    leadId    ?? undefined,
          arquivo: {
            buffer:   anexo.buffer,
            nome:     anexo.nome,
            mimeType: anexo.mimeType || 'application/octet-stream',
          },
          tipo:   'Email — Anexo',
          status: 'recebido',
          origem: 'portal',  // documento veio do cliente
          metadados: { fonte: 'email', de: email.de, assunto: email.assunto },
        })
        documentosId.push(doc.id)
        anexosMeta.push({ nome: anexo.nome, url: doc.url, mimeType: anexo.mimeType })
      } else {
        // Remetente desconhecido — apenas upload S3, sem registro Documento
        const { uploadArquivo } = await import('@/lib/storage')
        const timestamp = Date.now()
        const key = `emails/desconhecidos/${timestamp}_${anexo.nome}`
        const url = await uploadArquivo(key, anexo.buffer, anexo.mimeType || 'application/octet-stream')
        anexosMeta.push({ nome: anexo.nome, url, mimeType: anexo.mimeType })
      }
    } catch {
      // Falha no upload de um anexo — continua com os demais
    }
  }

  // Sugestão de resposta (somente se identificou cliente ou lead)
  let sugestao: string | null = null
  if (associado) {
    sugestao = await gerarSugestao(email, clienteId, leadId)
  }

  // Registra interação via service (inclui RAG automático)
  const interacaoId = await registrarInteracao({
    tipo:      'email_recebido',
    titulo:    email.assunto,
    conteudo:  email.corpo,
    clienteId: clienteId ?? undefined,
    leadId:    leadId    ?? undefined,
    origem:    'sistema',
    escritorioEvento: !associado, // remetente desconhecido vai para log do escritório
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
  })

  return { interacaoId, clienteId, leadId, associado, sugestao, documentosId }
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
