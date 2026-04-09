/**
 * Stage do pipeline webhook WhatsApp:
 * Trata mensagens recebidas quando a conversa está pausada (humano no controle).
 *
 * Responsabilidades:
 *   - Salvar a mensagem do cliente no banco (com whatsappMsgData)
 *   - Atualizar timestamps da conversa
 *   - Enviar confirmação de recebimento de mídia
 *   - Arquivar mídia em fire-and-forget (download + classify + persist buffer)
 *   - Notificar o CRM via SSE
 */

import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { emitWhatsAppRefresh } from '@/lib/event-bus'
import { sendHumanLike } from '@/lib/whatsapp/human-like'
import { downloadMedia, extractPdfText } from '@/lib/whatsapp/media'
import { arquivarMidiaWhatsappAsync } from '@/lib/whatsapp/arquivar-midia'
import type { EvolutionConfig } from '@/lib/evolution'

type Input = {
  conversaId: string
  remoteJid: string
  textSanitizado: string
  mediaType: string | null
  key: Record<string, unknown>
  msg: Record<string, unknown> | null
  cfg: EvolutionConfig
  clienteId?: string
  leadId?: string
}

/**
 * Salva mensagem, confirma recebimento de mídia, arquiva e notifica o CRM.
 */
export async function tratarConversaPausada(input: Input): Promise<void> {
  const { conversaId, remoteJid, textSanitizado, mediaType, key, msg, cfg, clienteId, leadId } = input

  const conteudo = textSanitizado || (mediaType ? `[${mediaType}]` : '[mensagem]')
  const now = new Date()

  const [mensagemPausada] = await Promise.all([
    prisma.mensagemIA.create({
      data: {
        conversaId,
        role:            'user',
        conteudo,
        status:          'sent',
        ...(msg && { whatsappMsgData: { key, message: msg } as object }),
      },
    }),
    prisma.conversaIA.update({
      where: { id: conversaId },
      data:  { atualizadaEm: now, ultimaMensagemEm: now },
    }),
  ])

  // Notifica o WhatsApp Drawer do CRM (humano no controle) via SSE
  emitWhatsAppRefresh(conversaId)

  // Confirmação de recebimento para o cliente (só mídia — na conversa ativa a IA responde)
  if (mediaType && cfg) {
    sendHumanLike(cfg, remoteJid, 'Documento recebido ✓ Nossa equipe irá analisar em breve.')
      .catch((err: unknown) =>
        console.error('[whatsapp/webhook] erro ao enviar confirmação de mídia (conversa pausada):', { remoteJid, err }),
      )
  }

  // Classifica, arquiva e persiste buffer (fire-and-forget)
  if (mediaType && msg && cfg) {
    ;(async () => {
      try {
        const media = await downloadMedia(cfg, { key, message: msg })
        if (media) {
          // Persiste buffer na mensagem para o proxy servir sem re-fetch da Evolution
          await prisma.mensagemIA.update({
            where: { id: mensagemPausada.id },
            data: {
              mediaBuffer:   media.buffer as unknown as Uint8Array<ArrayBuffer>,
              mediaMimeType: media.mimeType,
              mediaFileName: media.fileName ?? null,
              mediaType:     mediaType === 'image' ? 'image' : 'document',
            },
          }).catch((err: unknown) =>
            console.error('[whatsapp/webhook] erro ao salvar buffer de mídia pausada:', { conversaId, err }),
          )

          const isPdf = mediaType === 'document' && media.mimeType.includes('pdf')
          const textoExtraido = isPdf
            ? (await Promise.race<string | null>([
                extractPdfText(media.buffer),
                new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
              ])) || undefined
            : undefined
          const base64 = (!isPdf && media.buffer) ? media.buffer.toString('base64') : undefined

          arquivarMidiaWhatsappAsync({
            media,
            base64,
            textoExtraido,
            conversaId,
            clienteId: clienteId ?? undefined,
            leadId:    leadId    ?? undefined,
            remoteJid,
            tipoMidia: mediaType === 'image' ? 'imagem' : 'documento',
          })
        }
      } catch (err) {
        console.error('[whatsapp/webhook] erro no arquivamento de mídia (conversa pausada):', {
          remoteJid,
          conversaId,
          err,
        })
        Sentry.captureException(err, {
          tags:  { module: 'whatsapp-webhook', operation: 'arquivar-midia-pausada' },
          extra: { remoteJid, conversaId, mediaType },
        })
      }
    })()
  }
}
