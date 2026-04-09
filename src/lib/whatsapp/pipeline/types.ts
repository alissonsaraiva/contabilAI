/**
 * Tipos compartilhados do pipeline de webhook WhatsApp.
 * Usados por todos os stages (validar, config, contato, mídia, salvar).
 */

import type { EvolutionConfig } from '@/lib/evolution'
import type { AIMessageContentPart } from '@/lib/ai/providers/types'

// ── Resultado genérico para early-return ────────────────────────────────────
export type EarlyReturn = { ok: false; response: string; status: number }

// ── Stage 1: validar-webhook ────────────────────────────────────────────────
export type ValidacaoOk = {
  ok: true
  remoteJid: string
  key: Record<string, unknown>
  msg: Record<string, unknown> | null
  textSanitizado: string
  mediaType: string | null
}
export type ValidacaoResult = EarlyReturn | ValidacaoOk

// ── Stage 2: carregar-config ────────────────────────────────────────────────
export type ConfigOk = {
  ok: true
  cfg: EvolutionConfig
  aiEnabled: boolean
  groqApiKey: string | null
}
export type ConfigResult = EarlyReturn | ConfigOk

// ── Stage 3: resolver-contato ───────────────────────────────────────────────
export type ContatoResolvido = {
  clienteId?: string
  leadId?: string
  socioId?: string
  tipo: 'cliente' | 'lead' | 'socio' | 'prospect' | 'desconhecido'
  conversaId: string
  pausada: boolean
}

// ── Stage 4: processar-midia-webhook ────────────────────────────────────────
export type MidiaResult = {
  textoFinal: string
  mediaContentParts: AIMessageContentPart[] | null
  savedMediaBuffer: Buffer | null
  savedMediaMimeType: string | null
  savedMediaFileName: string | null
  earlyReturn?: { response: string; status: number }
}
