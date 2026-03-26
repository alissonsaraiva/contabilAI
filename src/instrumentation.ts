export async function register() {
  // Apenas no servidor Node.js (não no Edge runtime)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const base = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

  // ── Email sync: a cada 2 minutos ─────────────────────────────────────────
  const EMAIL_INTERVAL_MS = 2 * 60 * 1000

  async function syncEmail() {
    try {
      const secret = process.env.CRON_SECRET
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (secret) headers['authorization'] = `Bearer ${secret}`
      await fetch(`${base}/api/email/sync`, { method: 'POST', headers })
    } catch {
      // Silencia erros — não deve derrubar o servidor
    }
  }

  // ── AI health check: a cada 5 minutos ────────────────────────────────────
  const AI_HEALTH_INTERVAL_MS = 5 * 60 * 1000

  async function checkAiHealth() {
    try {
      const { getAiConfig } = await import('@/lib/ai/config')
      const { setProviderHealth } = await import('@/lib/ai/health-cache')
      const config = await getAiConfig()

      async function probe(fn: () => Promise<void>, provider: Parameters<typeof setProviderHealth>[0]) {
        try {
          await fn()
          setProviderHealth(provider, { ok: true })
        } catch (e) {
          setProviderHealth(provider, { ok: false, error: (e as Error).message })
        }
      }

      const probes: Promise<void>[] = []

      if (config.anthropicApiKey) {
        probes.push(probe(async () => {
          const Anthropic = (await import('@anthropic-ai/sdk')).default
          const client = new Anthropic({ apiKey: config.anthropicApiKey })
          await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 5,
            messages: [{ role: 'user', content: 'ok?' }],
          })
        }, 'anthropic'))
      }

      if (config.openaiApiKey) {
        probes.push(probe(async () => {
          const url = `${config.openaiBaseUrl?.trim() || 'https://api.openai.com/v1'}/chat/completions`
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiApiKey}` },
            body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'ok?' }], max_tokens: 5 }),
            signal: AbortSignal.timeout(10_000),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
        }, 'openai'))
      }

      if (config.googleApiKey) {
        probes.push(probe(async () => {
          const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.googleApiKey}`, 'x-goog-api-key': config.googleApiKey! },
            body: JSON.stringify({ model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'ok?' }], max_tokens: 5 }),
            signal: AbortSignal.timeout(10_000),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
        }, 'google'))
      }

      if (config.groqApiKey) {
        probes.push(probe(async () => {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.groqApiKey}` },
            body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: 'ok?' }], max_tokens: 5 }),
            signal: AbortSignal.timeout(10_000),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
        }, 'groq'))
      }

      if (config.voyageApiKey) {
        probes.push(probe(async () => {
          const res = await fetch('https://api.voyageai.com/v1/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.voyageApiKey}` },
            body: JSON.stringify({ input: ['test'], model: 'voyage-3-lite' }),
            signal: AbortSignal.timeout(10_000),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
        }, 'voyage'))
      }

      await Promise.allSettled(probes)
    } catch {
      // Silencia erros de infra — não deve derrubar o servidor
    }
  }

  // Aguarda 30s após startup antes do primeiro ciclo de email
  setTimeout(() => {
    syncEmail()
    setInterval(syncEmail, EMAIL_INTERVAL_MS)
  }, 30_000)

  // Aguarda 60s antes do primeiro health check (deixa o servidor estabilizar)
  setTimeout(() => {
    checkAiHealth()
    setInterval(checkAiHealth, AI_HEALTH_INTERVAL_MS)
  }, 60_000)
}
