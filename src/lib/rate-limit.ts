/**
 * Rate limiter in-memory — persiste enquanto o processo estiver vivo.
 * Para deploy multi-instância: substituir por Redis.
 * Compatível apenas com Node runtime (não usar em Edge/proxy).
 */

type Entry = { count: number; resetAt: number }

const store = new Map<string, Entry>()

// Limpeza periódica para evitar leak de memória
const cleanup = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(key)
  }
}, 5 * 60_000)

// Evita que o intervalo impeça o processo de terminar
cleanup.unref?.()

export type RateLimitResult =
  | { allowed: true;  remaining: number }
  | { allowed: false; retryAfterMs: number }

/**
 * Verifica e incrementa o contador para uma chave.
 * @param key      Identificador único (ex: `login:user@email.com`)
 * @param limit    Número máximo de requisições na janela
 * @param windowMs Duração da janela em milissegundos
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  let entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs }
    store.set(key, entry)
    return { allowed: true, remaining: limit - 1 }
  }

  if (entry.count >= limit) {
    return { allowed: false, retryAfterMs: entry.resetAt - now }
  }

  entry.count++
  return { allowed: true, remaining: limit - entry.count }
}

/**
 * Extrai o IP real da requisição considerando proxies reversos (Nginx, Cloudflare).
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

/** Retorna resposta 429 padronizada */
export function tooManyRequests(retryAfterMs?: number) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (retryAfterMs) {
    headers['Retry-After'] = String(Math.ceil(retryAfterMs / 1000))
  }
  return new Response(
    JSON.stringify({ error: 'Muitas requisições. Tente novamente mais tarde.' }),
    { status: 429, headers },
  )
}
