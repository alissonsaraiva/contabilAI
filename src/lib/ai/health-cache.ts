/**
 * In-memory singleton for AI provider health status and fallback event log.
 * Stored on `globalThis` so it survives Next.js hot reloads in dev.
 */

export type ProviderStatus = {
  ok: boolean
  checkedAt: number   // Date.now()
  error?: string
}

export type AiHealthSnapshot = {
  claude:  ProviderStatus
  openai:  ProviderStatus
  google:  ProviderStatus
  groq:    ProviderStatus
  voyage:  ProviderStatus
}

export type FallbackEvent = {
  id:           number
  fromProvider: string
  toProvider:   string
  feature:      string   // 'crm' | 'whatsapp' | 'agente' | etc.
  error:        string
  timestamp:    number   // Date.now()
}

const DEFAULT_STATUS: ProviderStatus = { ok: true, checkedAt: 0 }
const MAX_EVENTS = 100

declare global {
  // eslint-disable-next-line no-var
  var __aiHealth:         AiHealthSnapshot | undefined
  // eslint-disable-next-line no-var
  var __aiFallbackEvents: FallbackEvent[]  | undefined
  // eslint-disable-next-line no-var
  var __aiFallbackSeq:    number           | undefined
}

function getCache(): AiHealthSnapshot {
  if (!global.__aiHealth) {
    global.__aiHealth = {
      claude: { ...DEFAULT_STATUS },
      openai: { ...DEFAULT_STATUS },
      google: { ...DEFAULT_STATUS },
      groq:   { ...DEFAULT_STATUS },
      voyage: { ...DEFAULT_STATUS },
    }
  }
  return global.__aiHealth
}

function getEvents(): FallbackEvent[] {
  if (!global.__aiFallbackEvents) global.__aiFallbackEvents = []
  return global.__aiFallbackEvents
}

// ─── Health status ─────────────────────────────────────────────────────────

export function getAiHealth(): AiHealthSnapshot {
  return getCache()
}

export function setProviderHealth(
  provider: keyof AiHealthSnapshot,
  status: Omit<ProviderStatus, 'checkedAt'>,
) {
  getCache()[provider] = { ...status, checkedAt: Date.now() }
}

/** Returns true if any configured/checked provider is currently down */
export function anyProviderDown(): boolean {
  const h = getCache()
  return Object.values(h).some(s => s.checkedAt > 0 && !s.ok)
}

// ─── Fallback event log ────────────────────────────────────────────────────

export function addFallbackEvent(event: Omit<FallbackEvent, 'id' | 'timestamp'>) {
  if (!global.__aiFallbackSeq) global.__aiFallbackSeq = 0
  const events = getEvents()
  events.unshift({ ...event, id: ++global.__aiFallbackSeq, timestamp: Date.now() })
  // Mantém só os últimos MAX_EVENTS
  if (events.length > MAX_EVENTS) events.splice(MAX_EVENTS)
}

export function getFallbackEvents(): FallbackEvent[] {
  return getEvents()
}
