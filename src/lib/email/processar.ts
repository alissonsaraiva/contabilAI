import { prisma } from '@/lib/prisma'
import { criarDocumento } from '@/lib/services/documentos'
import { registrarInteracao } from '@/lib/services/interacoes'
import { askAI } from '@/lib/ai/ask'
import { notificarEmailRecebido } from '@/lib/notificacoes'
import { classificarDocumento, buildContextoEmail } from '@/lib/services/classificar-documento'
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
  const anexosRejeitados: string[] = []

  const MAX_UNKNOWN_SIZE = 5 * 1024 * 1024  // 5 MB para remetentes desconhecidos

  const contextoEmail = buildContextoEmail(email.assunto, email.corpo)

  for (const anexo of email.anexos) {
    try {
      if (associado) {
        // Classifica se é documento formal antes de arquivar
        const deveArquivar = await classificarDocumento({
          arquivo: {
            nome:     anexo.nome,
            mimeType: anexo.mimeType || 'application/octet-stream',
            buffer:   anexo.buffer,
          },
          contexto: contextoEmail,
        }).catch(() => true)  // em caso de erro, arquiva por segurança

        if (!deveArquivar) {
          // Não é documento formal — registra rejeição para rastreabilidade no CRM
          console.log('[email/processar] anexo ignorado (não é documento formal):', anexo.nome)
          anexosRejeitados.push(anexo.nome)
          continue
        }

        // Usa criarDocumento() — S3 + banco + RAG + resumo automático
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
          origem: 'email',
          metadados: { fonte: 'email', de: email.de, assunto: email.assunto },
        })
        documentosId.push(doc.id)
        anexosMeta.push({ nome: anexo.nome, url: doc.url, mimeType: anexo.mimeType })
      } else {
        // Remetente desconhecido — apenas upload S3 se dentro do limite de tamanho
        if (anexo.buffer.byteLength > MAX_UNKNOWN_SIZE) {
          console.warn('[email/processar] anexo de remetente desconhecido ignorado (muito grande):', anexo.nome, anexo.buffer.byteLength)
          continue
        }
        const { uploadArquivo } = await import('@/lib/storage')
        const timestamp = Date.now()
        const key = `emails/desconhecidos/${timestamp}_${anexo.nome}`
        const url = await uploadArquivo(key, anexo.buffer, anexo.mimeType || 'application/octet-stream')
        anexosMeta.push({ nome: anexo.nome, url, mimeType: anexo.mimeType })
      }
    } catch (err) {
      console.error('[email/processar] falha ao processar anexo:', anexo.nome, err)
    }
  }

  // Sugestão de resposta (somente se identificou cliente ou lead)
  let sugestao: string | null = null
  if (associado) {
    sugestao = await gerarSugestao(email, clienteId, leadId)
  }

  // Deduplicação: evita salvar o mesmo email múltiplas vezes se o flag IMAP falhou
  if (email.messageId && !email.messageId.startsWith('uid-')) {
    const jaExiste = await prisma.interacao.findFirst({
      where: { metadados: { path: ['messageId'], equals: email.messageId } },
      select: { id: true },
    })
    if (jaExiste) {
      return { interacaoId: jaExiste.id, clienteId, leadId, associado, sugestao: null, documentosId: [] }
    }
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
      anexos:           anexosMeta,
      anexosRejeitados: anexosRejeitados.length > 0 ? anexosRejeitados : undefined,
      documentosId,
      sugestao,
    },
  })

  // Notifica a equipe (fire-and-forget, com cooldown de 5 min por remetente)
  notificarEmailRecebido({ de: email.de, assunto: email.assunto, interacaoId }).catch(() => {})

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

    // Enriquece o contexto com dados atuais do cliente para uma sugestão mais precisa
    // — evita respostas genéricas que ignoram o estado real do relacionamento
    const contextLines: (string | null)[] = [
      'EMAIL RECEBIDO — gere uma sugestão de resposta profissional e objetiva para o contador enviar.',
      `De: ${email.nomeRemetente} <${email.de}>`,
      `Assunto: ${email.assunto}`,
      email.anexos.length > 0
        ? `Anexos recebidos: ${email.anexos.map(a => a.nome).join(', ')}`
        : null,
    ]

    // Busca dados adicionais do cliente para contextualizar a sugestão
    if (clienteId) {
      try {
        const [cliente, osAberta, ultimasInteracoes] = await Promise.all([
          prisma.cliente.findUnique({
            where: { id: clienteId },
            select: { nome: true, status: true, planoTipo: true },
          }),
          prisma.ordemServico.findFirst({
            where: { clienteId, status: { in: ['aberta', 'em_andamento'] } },
            select: { titulo: true, status: true },
            orderBy: { criadoEm: 'desc' },
          }),
          prisma.interacao.findMany({
            where: { clienteId, tipo: { not: 'email_recebido' } },
            select: { tipo: true, titulo: true, criadoEm: true },
            orderBy: { criadoEm: 'desc' },
            take: 3,
          }),
        ])

        if (cliente) {
          contextLines.push(`\n## Contexto do cliente`)
          contextLines.push(`Nome: ${cliente.nome}`)
          contextLines.push(`Plano: ${cliente.planoTipo ?? 'não definido'} | Status: ${cliente.status}`)
        }
        if (osAberta) {
          contextLines.push(`Chamado em aberto: "${osAberta.titulo}" (${osAberta.status})`)
        }
        if (ultimasInteracoes.length > 0) {
          const ultimo = ultimasInteracoes[0]
          const dataUltimo = ultimo.criadoEm.toLocaleDateString('pt-BR')
          contextLines.push(`Último contato: ${ultimo.titulo ?? ultimo.tipo} em ${dataUltimo}`)
        }
      } catch {
        // Falha ao buscar contexto extra — continua com sugestão genérica
      }
    }

    const systemExtra = contextLines.filter(Boolean).join('\n')

    const { resposta } = await askAI({
      pergunta:   `Conteúdo do email:\n\n${email.corpo}`,
      context,
      feature:    'crm',
      systemExtra,
      maxTokens:  768,  // aumentado de 512 para acomodar respostas mais contextualizadas
    })

    return resposta
  } catch {
    return null
  }
}
