// Código exclusivo para o runtime Node.js — importado condicionalmente em instrumentation.ts

// Variáveis críticas de segurança — falha rápida se ausentes em produção
if (process.env.NODE_ENV === 'production') {
  const REQUIRED = [
    'AUTH_SECRET',
    'DATABASE_URL',
    'ENCRYPTION_KEY',           // criptografia de API keys no banco
    'STORAGE_ENDPOINT',         // R2/S3 — uploads de documentos
    'STORAGE_BUCKET_NAME',
    'STORAGE_ACCESS_KEY_ID',
    'STORAGE_SECRET_ACCESS_KEY',
    'STORAGE_PUBLIC_URL',
    'CRON_SECRET',              // protege endpoints de cron contra invocação externa
  ] as const
  const faltando = REQUIRED.filter(k => !process.env[k])
  if (faltando.length > 0) {
    console.error(`[startup] ERRO CRÍTICO: variáveis de ambiente obrigatórias ausentes: ${faltando.join(', ')}`)
    process.exit(1)
  }
}

const base = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

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

const AI_HEALTH_INTERVAL_MS = 5 * 60 * 1000

async function checkAiHealth() {
  try {
    const { getAiConfig } = await import('@/lib/ai/config')
    const { setProviderHealth, getAiHealth } = await import('@/lib/ai/health-cache')
    const config = await getAiConfig()

    async function probe(fn: () => Promise<void>, provider: Parameters<typeof setProviderHealth>[0]) {
      const anteriorOk = getAiHealth()[provider].ok
      const anteriorCheckedAt = getAiHealth()[provider].checkedAt
      try {
        await fn()
        setProviderHealth(provider, { ok: true })
      } catch (e) {
        const erro = (e as Error).message
        setProviderHealth(provider, { ok: false, error: erro })
        // Notifica apenas na transição ok → falhou (não repete a cada ciclo)
        const eraOk = anteriorCheckedAt === 0 || anteriorOk
        if (eraOk) {
          const { notificarIaOffline } = await import('@/lib/notificacoes')
          notificarIaOffline(provider, erro).catch(() => {})
        }
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
      }, 'claude'))
    }

    if (config.openaiApiKey) {
      probes.push(probe(async () => {
        const url = `${config.openaiBaseUrl?.trim() || 'https://api.openai.com/v1'}/chat/completions`
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiApiKey}` },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'ok?' }], max_completion_tokens: 5 }),
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

    // Sonda Voyage (fallback de embedding)
    // OpenAI é o embedding primário mas usa a mesma chave/health slot da sonda de chat acima
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

export {}
