/**
 * Webhook WhatsApp — Orquestrador.
 *
 * Cada responsabilidade foi extraída para um módulo em src/lib/whatsapp/pipeline/:
 *   1. validar-webhook   — auth, parse, filtros, dedup, rate limit, sanitização, jailbreak
 *   2. carregar-config   — config do escritório + validação apikey Evolution
 *   3. resolver-contato  — phone cache, identificação, conversa, pausa
 *   4. tratar-conversa-pausada — salvar msg + arquivar mídia em conversa pausada
 *   5. processar-midia-webhook — áudio, imagem, documento
 *   6. salvar-pendente    — mensagemIA pending + SSE
 */

import * as Sentry from '@sentry/nextjs'
import { getHistorico } from '@/lib/ai/conversa'
import { sendHumanLike } from '@/lib/whatsapp/human-like'
import { validarWebhook, marcarResposta } from '@/lib/whatsapp/pipeline/validar-webhook'
import { carregarConfig } from '@/lib/whatsapp/pipeline/carregar-config'
import { resolverContato } from '@/lib/whatsapp/pipeline/resolver-contato'
import { tratarConversaPausada } from '@/lib/whatsapp/pipeline/tratar-conversa-pausada'
import { processarMidiaWebhook } from '@/lib/whatsapp/pipeline/processar-midia-webhook'
import { salvarPendente, salvarSemIA } from '@/lib/whatsapp/pipeline/salvar-pendente'
import type { AIMessageContentPart } from '@/lib/ai/providers/types'
// Garante que todas as tools estejam registradas
import '@/lib/ai/tools'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  // ── Stage 1: Validação, filtros, sanitização ────────────────────────────
  const validacao = await validarWebhook(req)
  if (!validacao.ok) return new Response(validacao.response, { status: validacao.status })

  const { remoteJid, key, msg, textSanitizado, mediaType } = validacao

  // ── Stage 2: Config do escritório ───────────────────────────────────────
  const config = await carregarConfig(req)
  if (!config.ok) return new Response(config.response, { status: config.status })

  const { cfg, aiEnabled, groqApiKey } = config

  try {
    // ── Stage 3: Identificação do contato + conversa ────────────────────────
    const contato = await resolverContato(remoteJid)
    const { conversaId } = contato

    // ── Conversa pausada (humano no controle) ───────────────────────────────
    if (contato.pausada) {
      await tratarConversaPausada({
        conversaId, remoteJid, textSanitizado, mediaType,
        key, msg, cfg,
        clienteId: contato.clienteId,
        leadId:    contato.leadId,
      })
      return new Response('paused', { status: 200 })
    }

    // ── IA desabilitada — salvar para histórico ─────────────────────────────
    if (!aiEnabled) {
      await salvarSemIA({ conversaId, remoteJid, textSanitizado, mediaType, key, msg })
      return new Response('ai disabled', { status: 200 })
    }

    // ── Stage 4: Processamento de mídia ─────────────────────────────────────
    let textoFinal = textSanitizado
    let mediaContentParts: AIMessageContentPart[] | null = null
    let savedMediaBuffer: Buffer | null = null
    let savedMediaMimeType: string | null = null
    let savedMediaFileName: string | null = null

    if (mediaType && msg) {
      const historico = await getHistorico(conversaId)
      const midia = await processarMidiaWebhook({
        cfg, groqApiKey, key, msg, mediaType, textSanitizado,
        remoteJid, conversaId,
        clienteId: contato.clienteId,
        leadId:    contato.leadId,
        historico,
      })
      if (midia.earlyReturn) return new Response(midia.earlyReturn.response, { status: midia.earlyReturn.status })

      textoFinal         = midia.textoFinal
      mediaContentParts  = midia.mediaContentParts
      savedMediaBuffer   = midia.savedMediaBuffer
      savedMediaMimeType = midia.savedMediaMimeType
      savedMediaFileName = midia.savedMediaFileName
    }

    // Fallback: mídia sem download + sem texto → placeholder ou rejeita
    if (!textoFinal && !mediaContentParts) {
      if (mediaType) {
        textoFinal = `[${mediaType}]`
      } else {
        await sendHumanLike(cfg, remoteJid, 'Desculpe, não consegui processar essa mensagem. Pode enviar por texto?')
        return new Response('no_content', { status: 200 })
      }
    }

    // ── Stage 5: Salvar como pendente (debounce) ────────────────────────────
    await salvarPendente({
      conversaId, remoteJid, textoFinal, mediaType,
      key, msg, mediaContentParts,
      savedMediaBuffer, savedMediaMimeType, savedMediaFileName,
      clienteId: contato.clienteId,
      leadId:    contato.leadId,
      tipo:      contato.tipo,
    })

    marcarResposta(remoteJid)
  } catch (err) {
    console.error('[whatsapp/webhook] erro:', err)
    Sentry.captureException(err, { tags: { module: 'whatsapp-webhook' } })
  }

  return new Response('ok', { status: 200 })
}

export async function GET() {
  return new Response('ok', { status: 200 })
}
