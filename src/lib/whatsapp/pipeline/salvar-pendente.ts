/**
 * Stage final do pipeline webhook WhatsApp:
 * Salva a mensagem como pendente (debounce) e notifica o CRM via SSE.
 *
 * Responsabilidades:
 *   - Criar mensagemIA com status 'pending' e aiProcessado=false
 *   - Persistir buffer de mídia quando disponível
 *   - Atualizar ultimaMensagemEm na conversa (debounce usa este campo)
 *   - Emitir SSE para o WhatsApp Drawer do CRM
 */

import { prisma } from '@/lib/prisma'
import { emitWhatsAppRefresh } from '@/lib/event-bus'
import type { AIMessageContentPart } from '@/lib/ai/providers/types'

type Input = {
  conversaId: string
  remoteJid: string
  textoFinal: string
  mediaType: string | null
  key: Record<string, unknown>
  msg: Record<string, unknown> | null
  mediaContentParts: AIMessageContentPart[] | null
  savedMediaBuffer: Buffer | null
  savedMediaMimeType: string | null
  savedMediaFileName: string | null
  clienteId?: string
  leadId?: string
  tipo: string
}

/**
 * Salva mensagem como pending para processamento pelo cron e notifica o CRM.
 */
export async function salvarPendente(input: Input): Promise<void> {
  const {
    conversaId, remoteJid, textoFinal, mediaType,
    key, msg, mediaContentParts,
    savedMediaBuffer, savedMediaMimeType, savedMediaFileName,
    clienteId, leadId, tipo,
  } = input

  await prisma.mensagemIA.create({
    data: {
      conversaId,
      role:         'user',
      conteudo:     textoFinal || '[mídia]',
      status:       'pending',
      aiProcessado: false,
      ...(savedMediaBuffer && {
        mediaBuffer:   savedMediaBuffer as unknown as Uint8Array<ArrayBuffer>,
        mediaMimeType: savedMediaMimeType ?? undefined,
        mediaFileName: savedMediaFileName ?? undefined,
        mediaType:     mediaType === 'image' ? 'image' : 'document',
      }),
      whatsappMsgData: {
        key,
        message:           msg,
        mediaContentParts: mediaContentParts ?? null,
        remoteJid,
        clienteId:         clienteId ?? null,
        leadId:            leadId    ?? null,
        tipo,
      } as object,
    },
  })

  // Atualiza ultimaMensagemEm — o debounce usa este campo para saber quando o cliente parou de digitar
  await prisma.conversaIA.update({
    where: { id: conversaId },
    data:  { ultimaMensagemEm: new Date() },
  })

  // Notifica o WhatsApp Drawer do CRM via SSE (após salvar no DB)
  emitWhatsAppRefresh(conversaId)
}

/**
 * Salva mensagem sem processamento de IA (IA desabilitada).
 * Mantém histórico visível no CRM.
 */
export async function salvarSemIA(input: {
  conversaId: string
  remoteJid: string
  textSanitizado: string
  mediaType: string | null
  key: Record<string, unknown>
  msg: Record<string, unknown> | null
}): Promise<void> {
  const { conversaId, remoteJid, textSanitizado, mediaType, key, msg } = input
  const agora = new Date()

  await Promise.all([
    prisma.mensagemIA.create({
      data: {
        conversaId,
        role:             'user',
        conteudo:         textSanitizado || (mediaType ? `[${mediaType}]` : '[mensagem]'),
        status:           'sent',
        aiProcessado:     true,
        whatsappMsgData:  { key, message: msg } as object,
      },
    }).catch((err: unknown) =>
      console.error('[whatsapp/webhook] erro ao salvar mensagem (ai disabled):', { conversaId, remoteJid, err }),
    ),
    prisma.conversaIA.update({
      where: { id: conversaId },
      data:  { atualizadaEm: agora, ultimaMensagemEm: agora },
    }).catch((err: unknown) =>
      console.error('[whatsapp/webhook] erro ao atualizar conversaIA (ai disabled):', { conversaId, remoteJid, err }),
    ),
  ])
}
