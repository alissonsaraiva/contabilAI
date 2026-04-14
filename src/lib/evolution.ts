// Cliente para Evolution API (open-source WhatsApp API)
// Docs: https://doc.evolution-api.com
import * as Sentry from '@sentry/nextjs'

export type EvolutionConfig = {
  baseUrl: string
  apiKey: string
  instance: string
}

export type WhatsAppKey = { remoteJid: string; fromMe: boolean; id: string }

export type SendResult =
  | { ok: true; key?: WhatsAppKey }
  | { ok: false; error: string; attempts: number }

// ─── Erro tipado ──────────────────────────────────────────────────────────────

export class EvolutionError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message)
    this.name = 'EvolutionError'
  }

  /** Erros 4xx não devem ser retentados (número inválido, bloqueado, etc.) */
  isClientError(): boolean {
    return this.statusCode !== undefined && this.statusCode >= 400 && this.statusCode < 500
  }
}

// ─── Circuit Breaker (por processo) ──────────────────────────────────────────

const CIRCUIT_FAILURE_THRESHOLD = 5
const CIRCUIT_RESET_MS          = 60_000 // 1 minuto

type CircuitState = 'closed' | 'open' | 'half-open'

const circuit = {
  state:    'closed' as CircuitState,
  failures: 0,
  openedAt: 0,
}

function circuitAllow(): boolean {
  if (circuit.state === 'closed') return true
  if (circuit.state === 'open') {
    if (Date.now() - circuit.openedAt >= CIRCUIT_RESET_MS) {
      circuit.state = 'half-open'
      return true
    }
    return false
  }
  return true // half-open: permite uma sonda
}

function circuitSuccess(): void {
  circuit.failures = 0
  circuit.state    = 'closed'
}

function circuitFailure(): void {
  circuit.failures++
  if (circuit.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuit.state    = 'open'
    circuit.openedAt = Date.now()
    console.error('[evolution] circuit breaker aberto após', circuit.failures, 'falhas consecutivas')
    Sentry.captureMessage('Evolution API circuit breaker aberto', {
      level: 'error',
      tags:  { module: 'evolution', operation: 'circuit-breaker' },
      extra: { failures: circuit.failures },
    })
  }
}

// ─── Fetch com timeout ────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 15_000

async function evo(cfg: EvolutionConfig, method: string, path: string, body?: unknown) {
  const url        = `${cfg.baseUrl.replace(/\/$/, '')}${path}`
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.apiKey,
      },
      body:   body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }

  const text = await res.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = { raw: text } }

  if (!res.ok) throw new EvolutionError(`Evolution API ${res.status}: ${text.slice(0, 200)}`, res.status)
  return json
}

// ─── sendText com retry + exponential backoff ─────────────────────────────────

const RETRY_DELAYS_MS = [5_000, 15_000, 45_000] // 3 tentativas adicionais

export async function sendText(
  cfg: EvolutionConfig,
  to: string,
  text: string,
): Promise<SendResult> {
  const number = to.replace('@s.whatsapp.net', '').replace('@g.us', '')
  let lastError: unknown
  let attempt   = 0

  for (const delay of [0, ...RETRY_DELAYS_MS]) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay))
    attempt++

    if (!circuitAllow()) {
      return {
        ok:       false,
        error:    'circuit breaker aberto — Evolution API temporariamente indisponível',
        attempts: attempt,
      }
    }

    try {
      const res = await evo(cfg, 'POST', `/message/sendText/${cfg.instance}`, { number, text })
      circuitSuccess()
      const key = (res as Record<string, unknown>)?.key as WhatsAppKey | undefined
      return { ok: true, key }
    } catch (err) {
      lastError = err
      circuitFailure()
      // Não retenta erros 4xx (número inválido, bloqueado, etc.)
      if (err instanceof EvolutionError && err.isClientError()) {
        console.warn(`[evolution] sendText erro do cliente (${err.statusCode}), sem retry:`, err.message)
        break
      }
      console.warn(`[evolution] sendText tentativa ${attempt} falhou:`, err instanceof Error ? err.message : err)
    }
  }

  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError)
  return { ok: false, error: errorMessage, attempts: attempt }
}

// ─── sendMedia com retry (documentos, imagens, PDFs) ─────────────────────────

export type MediaType = 'document' | 'image' | 'video' | 'audio'

export async function sendMedia(
  cfg: EvolutionConfig,
  to: string,
  opts: {
    mediatype: MediaType
    mimetype: string
    /** Nome do arquivo exibido no WhatsApp */
    fileName: string
    /** Legenda opcional abaixo do arquivo */
    caption?: string
    /** URL pública do arquivo (preferida — Evolution baixa direto) */
    mediaUrl?: string
    /** Base64 do arquivo (fallback quando não há URL pública) */
    mediaBase64?: string
  },
): Promise<SendResult> {
  const number  = to.replace('@s.whatsapp.net', '').replace('@g.us', '')
  let lastError: unknown
  let attempt   = 0

  for (const delay of [0, ...RETRY_DELAYS_MS]) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay))
    attempt++

    if (!circuitAllow()) {
      return {
        ok:       false,
        error:    'circuit breaker aberto — Evolution API temporariamente indisponível',
        attempts: attempt,
      }
    }

    try {
      const res = await evo(cfg, 'POST', `/message/sendMedia/${cfg.instance}`, {
        number,
        mediatype: opts.mediatype,
        mimetype:  opts.mimetype,
        caption:   opts.caption ?? '',
        fileName:  opts.fileName,
        // Evolution v2 aceita apenas 'media' tanto para URL quanto para base64
        media: opts.mediaUrl ?? opts.mediaBase64,
      })
      circuitSuccess()
      const key = (res as Record<string, unknown>)?.key as WhatsAppKey | undefined
      return { ok: true, key }
    } catch (err) {
      lastError = err
      circuitFailure()
      if (err instanceof EvolutionError && err.isClientError()) {
        console.warn(`[evolution] sendMedia erro do cliente (${err.statusCode}), sem retry:`, err.message)
        break
      }
      console.warn(`[evolution] sendMedia tentativa ${attempt} falhou:`, err instanceof Error ? err.message : err)
    }
  }

  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError)
  return { ok: false, error: errorMessage, attempts: attempt }
}

// ─── Funções auxiliares (sem retry — erros não críticos ou administrativas) ───

// Cria instância
export async function createInstance(cfg: EvolutionConfig) {
  return evo(cfg, 'POST', '/instance/create', {
    instanceName: cfg.instance,
    qrcode:       true,
    integration:  'WHATSAPP-BAILEYS',
  })
}

// Retorna QR code (base64) e status de conexão
export async function getConnectionState(cfg: EvolutionConfig) {
  return evo(cfg, 'GET', `/instance/connectionState/${cfg.instance}`)
}

// Conecta (gera novo QR)
export async function connectInstance(cfg: EvolutionConfig) {
  return evo(cfg, 'GET', `/instance/connect/${cfg.instance}`)
}

// Desconecta (logout WhatsApp)
export async function logoutInstance(cfg: EvolutionConfig) {
  return evo(cfg, 'DELETE', `/instance/logout/${cfg.instance}`)
}

// Deleta instância
export async function deleteInstance(cfg: EvolutionConfig) {
  return evo(cfg, 'DELETE', `/instance/delete/${cfg.instance}`)
}

// Apaga mensagem para todos no WhatsApp (equivalente ao "apagar para todos")
// Endpoint Evolution API v2: DELETE /chat/deleteMessageForEveryone/{instance}
// Só funciona para mensagens enviadas por nós (fromMe: true) e dentro de ~60h do envio.
// Falha silenciosa se a mensagem já expirou — o soft delete local deve ocorrer de qualquer forma.
export async function deleteMessage(
  cfg: EvolutionConfig,
  remoteJid: string,
  messageId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await evo(cfg, 'DELETE', `/chat/deleteMessageForEveryone/${cfg.instance}`, {
      id:        messageId,
      remoteJid,
      fromMe:    true,
      participant: '',
    })
    return { ok: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { ok: false, error }
  }
}

// Configura webhook da instância
// headers.apikey é obrigatório: o app valida que toda chamada de webhook
// vem com o header apikey === cfg.apiKey para rejeitar chamadas não autorizadas.
export async function setWebhook(cfg: EvolutionConfig, webhookUrl: string) {
  return evo(cfg, 'POST', `/webhook/set/${cfg.instance}`, {
    webhook: {
      enabled:           true,
      url:               webhookUrl,
      headers:           { apikey: cfg.apiKey },
      webhook_by_events: false,
      webhook_base64:    false,
      events:            ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
    },
  })
}

// Envia indicador de digitação (composing) por durationMs milissegundos
export async function sendPresence(cfg: EvolutionConfig, to: string, durationMs: number = 2000) {
  const number = to.replace('@s.whatsapp.net', '').replace('@g.us', '')
  try {
    return await evo(cfg, 'POST', `/chat/sendPresence/${cfg.instance}`, {
      number,
      options: { presence: 'composing', delay: durationMs },
    })
  } catch {
    // Ignora erros de presença — não crítico
  }
}
