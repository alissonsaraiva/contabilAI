/**
 * Stage do pipeline webhook WhatsApp:
 * Processa mídia recebida (áudio, imagem, documento) antes de salvar como pendente.
 *
 * Responsabilidades:
 *   - Áudio: download → transcrição via Groq Whisper → fallback / escalação
 *   - Imagem: download → base64 → content parts para vision → arquivar
 *   - Documento: download → extração PDF / imagem → arquivar
 *   - Retorno de early-return quando necessário (áudio sem transcrição, sem groq key)
 */

import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { sendHumanLike } from '@/lib/whatsapp/human-like'
import { downloadMedia, downloadMediaDirect, extractMediaCaption, extractMimeType, extractPdfText } from '@/lib/whatsapp/media'
import { transcribeAudio } from '@/lib/ai/transcribe'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { arquivarMidiaWhatsappAsync } from '@/lib/whatsapp/arquivar-midia'
import type { EvolutionConfig } from '@/lib/evolution'
import type { getHistorico } from '@/lib/ai/conversa'
import type { MidiaResult } from './types'

type Input = {
  cfg: EvolutionConfig
  groqApiKey: string | null
  key: Record<string, unknown>
  msg: Record<string, unknown>
  mediaType: string
  textSanitizado: string
  remoteJid: string
  conversaId: string
  clienteId?: string
  leadId?: string
  historico: Awaited<ReturnType<typeof getHistorico>>
}

/**
 * Processa mídia e retorna texto final + content parts + buffers salvos.
 * Pode retornar `earlyReturn` quando o fluxo deve encerrar (áudio falho, sem groq key).
 */
export async function processarMidiaWebhook(input: Input): Promise<MidiaResult> {
  const { cfg, groqApiKey, key, msg, mediaType, textSanitizado, remoteJid, conversaId, clienteId, leadId, historico } = input

  let textoFinal = textSanitizado
  let mediaContentParts: MidiaResult['mediaContentParts'] = null
  let savedMediaBuffer: Buffer | null = null
  let savedMediaMimeType: string | null = null
  let savedMediaFileName: string | null = null

  const caption = extractMediaCaption(msg)
  const mimeType = extractMimeType(msg)

  // ── Áudio ───────────────────────────────────────────────────────────────
  if (mediaType === 'audio') {
    return processarAudio({ cfg, groqApiKey, key, msg, mimeType, remoteJid, conversaId, clienteId, leadId, historico, textSanitizado })
  }

  // ── Imagem ──────────────────────────────────────────────────────────────
  if (mediaType === 'image') {
    try {
      const media = await downloadMedia(cfg, { key, message: msg })
        ?? await downloadMediaDirect(msg as Record<string, unknown>)
      if (media) {
        const base64 = media.buffer.toString('base64')
        mediaContentParts = [
          { type: 'image', mediaType: media.mimeType, data: base64 },
          ...(caption ? [{ type: 'text' as const, text: caption }] : []),
        ]
        textoFinal = caption || '[imagem enviada]'
        savedMediaBuffer   = media.buffer
        savedMediaMimeType = media.mimeType
        savedMediaFileName = media.fileName ?? null

        arquivarMidiaWhatsappAsync({
          media, base64, conversaId,
          clienteId: clienteId ?? undefined,
          leadId:    leadId    ?? undefined,
          remoteJid, tipoMidia: 'imagem',
        })
      }
    } catch (err) {
      console.error('[whatsapp/webhook] erro ao processar imagem:', err)
      Sentry.captureException(err, { tags: { module: 'whatsapp-webhook', operation: 'processar-imagem' }, extra: { remoteJid, conversaId } })
    }
  }

  // ── Documento ───────────────────────────────────────────────────────────
  if (mediaType === 'document') {
    try {
      const media = await downloadMedia(cfg, { key, message: msg })
        ?? await downloadMediaDirect(msg as Record<string, unknown>)
      if (media) {
        savedMediaBuffer   = media.buffer
        savedMediaMimeType = media.mimeType
        savedMediaFileName = media.fileName ?? null

        if (media.mimeType.includes('pdf')) {
          const pdfText = await Promise.race<string | null>([
            extractPdfText(media.buffer),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
          ])
          const fileName = media.fileName ?? 'documento'
          textoFinal = `[Documento recebido: ${fileName}]`
          if (pdfText) {
            console.log('[whatsapp/webhook] PDF extraído, chars:', pdfText.length)
          }
          arquivarMidiaWhatsappAsync({
            media, textoExtraido: pdfText || undefined, conversaId,
            clienteId: clienteId ?? undefined,
            leadId:    leadId    ?? undefined,
            remoteJid, tipoMidia: 'documento',
          })
        } else if (media.mimeType.startsWith('image/')) {
          const base64 = media.buffer.toString('base64')
          mediaContentParts = [
            { type: 'image', mediaType: media.mimeType, data: base64 },
            ...(caption ? [{ type: 'text' as const, text: caption }] : []),
          ]
          textoFinal = caption || '[documento/imagem enviado]'
          arquivarMidiaWhatsappAsync({
            media, base64, conversaId,
            clienteId: clienteId ?? undefined,
            leadId:    leadId    ?? undefined,
            remoteJid, tipoMidia: 'documento',
          })
        }
      }
    } catch (err) {
      console.error('[whatsapp/webhook] erro ao processar documento:', err)
      Sentry.captureException(err, { tags: { module: 'whatsapp-webhook', operation: 'processar-documento' }, extra: { remoteJid, conversaId } })
    }
  }

  return { textoFinal, mediaContentParts, savedMediaBuffer, savedMediaMimeType, savedMediaFileName }
}

// ── Handler de áudio (isolado por complexidade) ─────────────────────────────

type AudioInput = {
  cfg: EvolutionConfig
  groqApiKey: string | null
  key: Record<string, unknown>
  msg: Record<string, unknown>
  mimeType: string
  remoteJid: string
  conversaId: string
  clienteId?: string
  leadId?: string
  historico: Awaited<ReturnType<typeof getHistorico>>
  textSanitizado: string
}

async function processarAudio(input: AudioInput): Promise<MidiaResult> {
  const { cfg, groqApiKey, key, msg, mimeType, remoteJid, conversaId, clienteId, leadId, historico, textSanitizado } = input
  const base: MidiaResult = { textoFinal: textSanitizado, mediaContentParts: null, savedMediaBuffer: null, savedMediaMimeType: null, savedMediaFileName: null }

  if (!groqApiKey) {
    await sendHumanLike(cfg, remoteJid, 'Recebi um áudio, mas a transcrição não está configurada. Por favor, envie sua mensagem por texto.')
    // Await obrigatório: fire-and-forget em serverless pode perder a operação antes do early return
    await prisma.mensagemIA.create({
      data: { conversaId, role: 'user', conteudo: '[áudio]', status: 'sent', whatsappMsgData: { key, message: msg } as object },
    }).catch((saveErr: unknown) =>
      console.error('[whatsapp/webhook] erro ao salvar mensagem de áudio sem Groq key:', { conversaId, saveErr }),
    )
    await prisma.escalacao.create({
      data: {
        canal: 'whatsapp', status: 'pendente',
        clienteId: clienteId ?? null, leadId: leadId ?? null,
        remoteJid, conversaIAId: conversaId,
        historico: historico as object[],
        ultimaMensagem: '[Áudio recebido — transcrição não configurada]',
        motivoIA: 'Groq API key não configurada',
      },
    }).then(esc => {
      indexarAsync('escalacao', {
        id: esc.id, clienteId: esc.clienteId, leadId: esc.leadId,
        canal: 'whatsapp', motivoIA: esc.motivoIA, criadoEm: esc.criadoEm,
      })
    }).catch((escErr: unknown) =>
      console.error('[whatsapp/webhook] erro ao criar escalação por áudio sem Groq key:', { conversaId, escErr }),
    )
    return { ...base, earlyReturn: { response: 'no_groq_key', status: 200 } }
  }

  try {
    const media = await downloadMedia(cfg, { key, message: msg })
      ?? await downloadMediaDirect(msg as Record<string, unknown>)
    if (!media) {
      console.warn('[whatsapp/webhook] download de áudio falhou (Evolution + CDN):', remoteJid)
      Sentry.captureMessage('Download de áudio falhou — Evolution e CDN retornaram null', {
        level: 'error',
        tags:  { module: 'whatsapp-webhook', operation: 'download-audio' },
        extra: { remoteJid, conversaId },
      })
      await sendHumanLike(cfg, remoteJid, 'Não consegui ouvir seu áudio. Pode enviar por texto?')
      return { ...base, earlyReturn: { response: 'audio_download_null', status: 200 } }
    }

    const transcript = await transcribeAudio(media.buffer, media.mimeType || mimeType, groqApiKey)
    if (!transcript) {
      console.warn('[whatsapp/webhook] transcrição retornou vazio para áudio:', remoteJid)
      Sentry.captureMessage('Groq Whisper retornou transcrição vazia', {
        level: 'warning',
        tags:  { module: 'whatsapp-webhook', operation: 'transcricao-audio' },
        extra: { remoteJid, conversaId, mimeType },
      })
      await sendHumanLike(cfg, remoteJid, 'Não consegui entender seu áudio. Pode enviar por texto?')
      return { ...base, earlyReturn: { response: 'transcript_empty', status: 200 } }
    }

    console.log('[whatsapp/webhook] áudio transcrito:', transcript.slice(0, 80))
    return { ...base, textoFinal: transcript }
  } catch (err) {
    console.error('[whatsapp/webhook] erro ao transcrever áudio:', err)
    Sentry.captureException(err, {
      tags:  { module: 'whatsapp-webhook', operation: 'transcricao-audio' },
      extra: { remoteJid, conversaId, mimeType },
    })
    await sendHumanLike(cfg, remoteJid, 'Desculpe, não consegui processar o áudio. Pode digitar sua mensagem?')
    // Await obrigatório: fire-and-forget em serverless pode perder a operação antes do early return
    await prisma.mensagemIA.create({
      data: { conversaId, role: 'user', conteudo: '[áudio]', status: 'sent', whatsappMsgData: { key, message: msg } as object },
    }).catch((saveErr: unknown) =>
      console.error('[whatsapp/webhook] erro ao salvar mensagem de áudio não transcrito:', { conversaId, saveErr }),
    )
    await prisma.escalacao.create({
      data: {
        canal: 'whatsapp', status: 'pendente',
        clienteId: clienteId ?? null, leadId: leadId ?? null,
        remoteJid, conversaIAId: conversaId,
        historico: historico as object[],
        ultimaMensagem: '[Áudio não transcrito — erro na API Groq]',
        motivoIA: `Falha na transcrição: ${(err as Error).message?.slice(0, 200)}`,
      },
    }).then(esc => {
      indexarAsync('escalacao', {
        id: esc.id, clienteId: esc.clienteId, leadId: esc.leadId,
        canal: 'whatsapp', motivoIA: esc.motivoIA, criadoEm: esc.criadoEm,
      })
    }).catch((escErr: unknown) =>
      console.error('[whatsapp/webhook] erro ao criar escalação por falha de transcrição:', { conversaId, escErr }),
    )
    await prisma.conversaIA.update({ where: { id: conversaId }, data: { pausadaEm: new Date() } })
    return { ...base, earlyReturn: { response: 'transcription_error', status: 200 } }
  }
}
