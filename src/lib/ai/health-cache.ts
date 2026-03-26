/**
 * In-memory singleton for AI provider health status.
 * Stored on `globalThis` so it survives Next.js hot reloads in dev.
 */

export type ProviderStatus = {
  ok: boolean
  checkedAt: number   // Date.now()
  error?: string
}

export type AiHealthSnapshot = {
  anthropic: ProviderStatus
  openai:    ProviderStatus
  google:    ProviderStatus
  groq:      ProviderStatus
  voyage:    ProviderStatus
}

const DEFAULT_STATUS: ProviderStatus = { ok: true, checkedAt: 0 }

declare global {
  // eslint-disable-next-line no-var
  var __aiHealth: AiHealthSnapshot | undefined
}

function getCache(): AiHealthSnapshot {
  if (!global.__aiHealth) {
    global.__aiHealth = {
      anthropic: { ...DEFAULT_STATUS },
      openai:    { ...DEFAULT_STATUS },
      google:    { ...DEFAULT_STATUS },
      groq:      { ...DEFAULT_STATUS },
      voyage:    { ...DEFAULT_STATUS },
    }
  }
  return global.__aiHealth
}

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
