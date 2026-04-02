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
  metadados?: Record<string, unknown>
}

export type EnviarEmailComHistoricoResult = {
  ok:         boolean
  messageId?: string
  erro?:      string
}

export async function enviarEmailComHistorico(
  input: EnviarEmailComHistoricoInput,
): Promise<EnviarEmailComHistoricoResult> {
  // Busca nome do escritório para o template
  const escritorio = await prisma.escritorio.findFirst({ select: { nome: true } }).catch(() => null)
  const corpoHtml  = wrapEmailHtml(input.corpo, {
    nomeEscritorio: escritorio?.nome ?? 'Avos',
    assunto:        input.assunto,
  })

  const resultado = await sendEmail({
    para:    input.para,
    assunto: input.assunto,
    corpo:   corpoHtml,
    replyTo: input.replyTo,
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
      metadados: {
        para:      input.para,
        messageId: resultado.messageId,
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
