import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { criarDocumento } from '@/lib/services/documentos'
import { registrarInteracao } from '@/lib/services/interacoes'
import { askAI } from '@/lib/ai/ask'
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
  const { clienteId, leadId, empresaId } = await identificarRemetente(email.de)
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
          // Não é documento formal — não cria Documento no banco, mas faz upload S3
          // para que o anexo apareça no painel de e-mail (sem ele o arquivo some da tela)
          console.log('[email/processar] anexo não arquivado formalmente (não é documento formal):', anexo.nome)
          anexosRejeitados.push(anexo.nome)
          try {
            const { uploadArquivo } = await import('@/lib/storage')
            const key = `emails/anexos/${clienteId ?? leadId ?? 'unknown'}/${Date.now()}_${anexo.nome}`
            const url = await uploadArquivo(key, anexo.buffer, anexo.mimeType || 'application/octet-stream')
            anexosMeta.push({ nome: anexo.nome, url, mimeType: anexo.mimeType })
          } catch (uploadErr) {
            console.error('[email/processar] falha ao fazer upload de anexo informal:', anexo.nome, uploadErr)
            Sentry.captureException(uploadErr, { tags: { module: 'email-processar', operation: 'upload-anexo-informal' }, extra: { nomeAnexo: anexo.nome } })
          }
          continue
        }

        // Usa criarDocumento() — S3 + banco + RAG + resumo automático
        const doc = await criarDocumento({
          clienteId: clienteId ?? undefined,
          leadId:    leadId    ?? undefined,
          empresaId: empresaId ?? undefined,
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
      Sentry.captureException(err, { tags: { module: 'email-processar', operation: 'processar-anexo' }, extra: { nomeAnexo: anexo.nome } })
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

  // ── Threading por messageId/In-Reply-To/References ───────────────────────
  let emailThreadId: string | null = null

  if (email.inReplyTo) {
    // Tenta encontrar o email ao qual estamos respondendo para herdar a thread
    const emailPai = await prisma.interacao.findFirst({
      where: {
        emailMessageId: email.inReplyTo,
        tipo:           { in: ['email_recebido', 'email_enviado'] },
      },
      select: { emailThreadId: true, emailMessageId: true },
    })
    if (emailPai) {
      emailThreadId = emailPai.emailThreadId ?? emailPai.emailMessageId
    }
  }

  // Fallback via References — cobre o caso de o provedor (Resend/SMTP) sobrescrever o
  // Message-ID do email enviado, fazendo o inReplyTo do cliente não bater com o que
  // temos no banco. O header References contém toda a cadeia; o ID raiz da thread
  // sempre está lá e foi salvo como emailMessageId do email_recebido original.
  if (!emailThreadId && email.references.length > 0) {
    const emailRef = await prisma.interacao.findFirst({
      where: {
        emailMessageId: { in: email.references },
        tipo:           { in: ['email_recebido', 'email_enviado'] },
      },
      orderBy: { criadoEm: 'desc' },
      select: { emailThreadId: true, emailMessageId: true },
    })
    if (emailRef) {
      emailThreadId = emailRef.emailThreadId ?? emailRef.emailMessageId
    }
  }

  // Se não há inReplyTo nem References com match, este email é a raiz de uma nova thread
  if (!emailThreadId && email.messageId && !email.messageId.startsWith('uid-')) {
    emailThreadId = email.messageId
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
    emailMessageId: email.messageId && !email.messageId.startsWith('uid-') ? email.messageId : undefined,
    emailInReplyTo: email.inReplyTo ?? undefined,
    emailThreadId:  emailThreadId ?? undefined,
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

  return { interacaoId, clienteId, leadId, associado, sugestao, documentosId }
}

async function identificarRemetente(emailRemetente: string): Promise<{ clienteId: string | null; leadId: string | null; empresaId: string | null }> {
  const emailNorm = emailRemetente.toLowerCase().trim()

  const cliente = await prisma.cliente.findFirst({
    where: { email: { equals: emailNorm, mode: 'insensitive' } },
    select: { id: true, empresaId: true },
  })
  if (cliente) return { clienteId: cliente.id, leadId: null, empresaId: cliente.empresaId }

  const lead = await prisma.lead.findFirst({
    where: { dadosJson: { path: ['email'], equals: emailNorm } },
    select: { id: true },
  })
  if (lead) return { clienteId: null, leadId: lead.id, empresaId: null }

  // Fallback: contatoEntrada pode ser email
  const leadContato = await prisma.lead.findFirst({
    where: { contatoEntrada: { equals: emailNorm, mode: 'insensitive' } },
    select: { id: true },
  })
  if (leadContato) return { clienteId: null, leadId: leadContato.id, empresaId: null }

  return { clienteId: null, leadId: null, empresaId: null }
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
      'EMAIL RECEBIDO — escreva APENAS o corpo do e-mail de resposta, sem preâmbulo, sem explicações, sem meta-comentários como "Se quiser, posso adaptar..." ou similares. Termine obrigatoriamente com:\n\nAtenciosamente,\n[NOME_OPERADOR]\n[NOME_ESCRITORIO]',
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
          prisma.chamado.findFirst({
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
      } catch (contextErr) {
        // Falha ao buscar contexto extra — continua com sugestão genérica, mas loga para diagnóstico
        console.error('[email/processar] falha ao buscar contexto do cliente para sugestão:', { clienteId, err: contextErr })
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
  } catch (err) {
    console.error('[email/processar] falha ao gerar sugestão de resposta:', {
      de:      email.de,
      assunto: email.assunto,
      err,
    })
    Sentry.captureException(err, {
      tags:  { module: 'email-processar', operation: 'gerar-sugestao' },
      extra: { de: email.de, assunto: email.assunto, clienteId, leadId },
    })
    return null
  }
}
