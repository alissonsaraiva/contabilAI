/**
 * enviarEmailComHistorico — wrapper que envia e-mail e registra interação + RAG.
 *
 * Substitui o padrão duplicado em 7 locais:
 *   sendEmail(...) + prisma.interacao.create(...) + indexarAsync(...)
 *
 * Uso:
 *   const result = await enviarEmailComHistorico({ clienteId, para, assunto, corpo })
 */

import * as Sentry from '@sentry/nextjs'
import { nanoid } from 'nanoid'
import { sendEmail } from '@/lib/email/send'
import { wrapEmailHtml } from '@/lib/email/template'
import { registrarInteracao } from '@/lib/services/interacoes'
import { prisma } from '@/lib/prisma'
import type { Anexo } from '@/lib/email/send'

export type EnviarEmailComHistoricoInput = {
  para:       string
  assunto:    string
  corpo:      string
  replyTo?:   string
  anexos?:    Anexo[]
  // Vínculo para histórico
  clienteId?: string
  leadId?:    string
  // Contexto de quem enviou
  origem?:    'usuario' | 'ia' | 'agente' | 'sistema'
  usuarioId?: string
  interacaoOrigemId?: string
  metadados?: Record<string, unknown>
  emailThreadId?:         string  // Thread a que este email pertence
  inReplyToMessageId?:    string  // Message-ID do email ao qual estamos respondendo
}

export type EnviarEmailComHistoricoResult = {
  ok:         boolean
  messageId?: string
  erro?:      string
}

export async function enviarEmailComHistorico(
  input: EnviarEmailComHistoricoInput,
): Promise<EnviarEmailComHistoricoResult> {
  // Gera Message-ID customizado para rastreamento de thread
  const escritorioHost = process.env.EMAIL_REMETENTE?.split('@')[1] ?? 'avos.digital'
  const customMessageId = `<${nanoid(16)}@${escritorioHost}>`

  // Busca nome do escritório para o template
  const escritorio = await prisma.escritorio.findFirst({ select: { nome: true } }).catch(err => { console.error('[email/com-historico] falha ao buscar escritório:', err); return null })
  const corpoHtml  = wrapEmailHtml(input.corpo, {
    nomeEscritorio: escritorio?.nome ?? 'Avos',
    assunto:        input.assunto,
  })

  // Monta o header References com toda a cadeia da thread (para agrupamento correto
  // nos clientes de email do destinatário). Busca todos os messageIds da thread em ordem.
  let referencesChain: string | undefined
  const threadIdParaBusca = input.emailThreadId ?? input.inReplyToMessageId
  if (threadIdParaBusca) {
    try {
      const mensagensDaThread = await prisma.interacao.findMany({
        where: {
          emailThreadId: threadIdParaBusca,
          emailMessageId: { not: null },
        },
        orderBy: { criadoEm: 'asc' },
        select: { emailMessageId: true },
      })
      const ids = mensagensDaThread
        .map(m => m.emailMessageId)
        .filter(Boolean) as string[]
      // Inclui o inReplyTo caso não esteja na cadeia (pode ser o root antes de ter threadId)
      if (input.inReplyToMessageId && !ids.includes(input.inReplyToMessageId)) {
        ids.unshift(input.inReplyToMessageId)
      }
      if (ids.length > 0) referencesChain = ids.join(' ')
    } catch (err) {
      console.error('[email/com-historico] falha ao buscar cadeia de referências:', err)
      // Falha ao buscar cadeia — usa apenas inReplyTo como fallback
      referencesChain = input.inReplyToMessageId
    }
  }

  const resultado = await sendEmail({
    para:    input.para,
    assunto: input.assunto,
    corpo:   corpoHtml,
    replyTo: input.replyTo,
    inReplyTo:       input.inReplyToMessageId,
    references:      referencesChain,
    customMessageId: customMessageId,
    anexos:  input.anexos,
  })

  if (!resultado.ok) {
    return { ok: false, erro: resultado.erro }
  }

  // Registra interação (inclui RAG automático via service)
  // Falha aqui não desfaz o envio — registra separadamente para não perder o histórico
  try {
    await registrarInteracao({
      tipo:      'email_enviado',
      titulo:    input.assunto,
      conteudo:  input.corpo,
      clienteId: input.clienteId,
      leadId:    input.leadId,
      usuarioId: input.usuarioId,
      origem:    input.origem ?? 'sistema',
      emailMessageId: customMessageId,
      emailInReplyTo: input.inReplyToMessageId,
      emailThreadId:  input.emailThreadId ?? input.inReplyToMessageId ?? customMessageId,
      metadados: {
        para:      input.para,
        messageId: resultado.messageId,
        ...(input.interacaoOrigemId ? { interacaoOrigemId: input.interacaoOrigemId } : {}),
        ...(input.metadados ?? {}),
      },
    })
  } catch (err) {
    // Email já foi enviado com sucesso — falha no histórico não retorna erro ao caller,
    // mas deve ser rastreada para investigação posterior
    console.error('[email/com-historico] falha ao registrar interação após envio:', {
      para:    input.para,
      assunto: input.assunto,
      err,
    })
    Sentry.captureException(err, {
      tags:  { module: 'email-com-historico', operation: 'registrar-interacao' },
      extra: { para: input.para, assunto: input.assunto, clienteId: input.clienteId, leadId: input.leadId },
    })
  }

  return { ok: true, messageId: resultado.messageId }
}
