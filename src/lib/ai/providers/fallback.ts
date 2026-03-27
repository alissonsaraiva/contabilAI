/**
 * Fallback automático entre providers de IA.
 *
 * Circuit breaker: se um provider falhar, fica "aberto" por CIRCUIT_BREAK_MS
 * e é pulado nas próximas requisições até se recuperar.
 *
 * Ordem de fallback padrão: claude → openai → google
 * Para o agente (tool use): apenas providers que implementam completeWithTools.
 */

import { getProvider } from './index'
import { getAiHealth, setProviderHealth, addFallbackEvent } from '../health-cache'
import type { AiConfig } from '../config'
import type { AIRequest, AIResponse, AIRequestWithTools, AIResponseWithTools } from './types'

// Tempo de circuit break — provider marcado como falho é pulado por este período
const CIRCUIT_BREAK_MS = 2 * 60 * 1000  // 2 minutos

type KnownProvider = 'claude' | 'openai' | 'google'

const PROVIDER_ORDER: KnownProvider[] = ['claude', 'openai', 'google']

function apiKeyFor(config: AiConfig, provider: KnownProvider): string | null {
  switch (provider) {
    case 'claude': return config.anthropicApiKey
    case 'openai': return config.openaiApiKey
    case 'google': return config.googleApiKey
  }
}

function defaultModelFor(config: AiConfig, provider: KnownProvider): string {
  switch (provider) {
    case 'claude': return 'claude-haiku-4-5-20251001'
    case 'openai': return config.openaiModel || 'gpt-4o-mini'
    case 'google': return 'gemini-2.5-flash'
  }
}

function baseUrlFor(config: AiConfig, provider: KnownProvider): string | undefined {
  return provider === 'openai' ? config.openaiBaseUrl ?? undefined : undefined
}

function isCircuitOpen(provider: KnownProvider): boolean {
  const health = getAiHealth()[provider]
  return health.checkedAt > 0 && !health.ok && (Date.now() - health.checkedAt) < CIRCUIT_BREAK_MS
}

function markOk(provider: KnownProvider): void {
  setProviderHealth(provider, { ok: true })
}

function markFailed(provider: KnownProvider, error: string): void {
  const eraOk = getAiHealth()[provider].checkedAt === 0 || getAiHealth()[provider].ok
  setProviderHealth(provider, { ok: false, error })
  console.warn(`[ai/fallback] Provider "${provider}" falhou e será ignorado por ${CIRCUIT_BREAK_MS / 1000}s: ${error}`)
  // Notifica equipe apenas na transição ok→falhou (evita spam)
  if (eraOk) {
    import('@/lib/notificacoes')
      .then(({ notificarIaOffline }) => notificarIaOffline(provider, error))
      .catch(() => {})
  }
}

function logFallback(from: string, to: string, feature: string, error: string) {
  addFallbackEvent({ fromProvider: from, toProvider: to, feature, error })
  console.warn(`[ai/fallback] Usando "${to}" como fallback de "${from}" (${feature}): ${error}`)
}

/**
 * Ordena providers para tentar: primário primeiro, depois os demais que têm
 * API key configurada e cujo circuit não está aberto.
 */
function resolveOrder(config: AiConfig, primary: string): KnownProvider[] {
  const ordered: KnownProvider[] = [
    primary as KnownProvider,
    ...PROVIDER_ORDER.filter(p => p !== primary),
  ]
  return ordered.filter(p => !!apiKeyFor(config, p))
}

// ─── complete() com fallback ──────────────────────────────────────────────────

export type FallbackResponse = AIResponse & { providerUsed: string; wasFallback: boolean }

export async function completeWithFallback(
  req: Omit<AIRequest, 'apiKey' | 'baseUrl' | 'model'> & { model?: string; feature?: string },
  config: AiConfig,
  primaryProvider: string,
): Promise<FallbackResponse> {
  const feature    = req.feature ?? 'desconhecido'
  const candidates = resolveOrder(config, primaryProvider)
  let lastErr: Error | null = null
  let firstFailed: string | null = null

  for (const provName of candidates) {
    if (isCircuitOpen(provName)) {
      console.info(`[ai/fallback] Pulando "${provName}" — circuit aberto`)
      continue
    }

    const apiKey  = apiKeyFor(config, provName)!
    const model   = provName === primaryProvider ? (req.model ?? defaultModelFor(config, provName)) : defaultModelFor(config, provName)
    const baseUrl = baseUrlFor(config, provName)

    try {
      const provider = getProvider(provName)
      const result   = await provider.complete({ ...req, model, apiKey, baseUrl })
      markOk(provName)
      if (firstFailed) logFallback(firstFailed, provName, feature, lastErr?.message ?? 'erro desconhecido')
      return { ...result, providerUsed: provName, wasFallback: provName !== primaryProvider }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!firstFailed) firstFailed = provName
      markFailed(provName, msg)
      lastErr = err instanceof Error ? err : new Error(msg)
    }
  }

  throw lastErr ?? new Error('Todos os providers de IA estão indisponíveis.')
}

// ─── completeWithTools() com fallback ────────────────────────────────────────

export type FallbackToolsResponse = AIResponseWithTools & { providerUsed: string; wasFallback: boolean }

export async function completeWithToolsFallback(
  req: Omit<AIRequestWithTools, 'apiKey' | 'baseUrl' | 'model'> & { model?: string },
  config: AiConfig,
  primaryProvider: string,
): Promise<FallbackToolsResponse> {
  const candidates = resolveOrder(config, primaryProvider)
  let lastErr: Error | null = null
  let firstFailed: string | null = null

  for (const provName of candidates) {
    if (isCircuitOpen(provName)) {
      console.info(`[ai/fallback] Agente: pulando "${provName}" — circuit aberto`)
      continue
    }

    const provider = getProvider(provName)

    // Tool use é obrigatório para o agente — pula providers que não suportam
    if (!provider.completeWithTools) continue

    const apiKey  = apiKeyFor(config, provName)!
    const model   = provName === primaryProvider ? (req.model ?? defaultModelFor(config, provName)) : defaultModelFor(config, provName)
    const baseUrl = baseUrlFor(config, provName)

    try {
      const result = await provider.completeWithTools({ ...req, model, apiKey, baseUrl })
      markOk(provName)
      if (firstFailed) logFallback(firstFailed, provName, 'agente', lastErr?.message ?? 'erro desconhecido')
      return { ...result, providerUsed: provName, wasFallback: provName !== primaryProvider }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!firstFailed) firstFailed = provName
      markFailed(provName, msg)
      lastErr = err instanceof Error ? err : new Error(msg)
    }
  }

  throw lastErr ?? new Error('Nenhum provider com suporte a tool use está disponível.')
}
