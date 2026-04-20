import { describe, it, expect } from 'vitest'
import { rateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit'

// ─── rateLimit ─────────────────────────────────────────────────────────────────

describe('rateLimit', () => {
  it('permite a primeira requisição', () => {
    const result = rateLimit('test-rl-1', 5, 60_000)
    expect(result.allowed).toBe(true)
    if (result.allowed) {
      expect(result.remaining).toBe(4)
    }
  })

  it('decrementa remaining a cada chamada', () => {
    const key = 'test-rl-2'
    rateLimit(key, 5, 60_000)
    const result = rateLimit(key, 5, 60_000)
    expect(result.allowed).toBe(true)
    if (result.allowed) {
      expect(result.remaining).toBe(3)
    }
  })

  it('bloqueia após atingir o limite', () => {
    const key = 'test-rl-3'
    for (let i = 0; i < 3; i++) {
      rateLimit(key, 3, 60_000)
    }
    const result = rateLimit(key, 3, 60_000)
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThan(0)
    }
  })

  it('reseta após a janela expirar', () => {
    const key = 'test-rl-4'
    // Usa janela de 1ms para testar reset
    rateLimit(key, 1, 1)
    // Espera 5ms para garantir que a janela expirou
    const start = Date.now()
    while (Date.now() - start < 5) { /* busy wait */ }
    const result = rateLimit(key, 1, 1)
    expect(result.allowed).toBe(true)
  })
})

// ─── getClientIp ───────────────────────────────────────────────────────────────

describe('getClientIp', () => {
  it('prioriza cf-connecting-ip', () => {
    const req = new Request('http://localhost', {
      headers: {
        'cf-connecting-ip': '1.2.3.4',
        'x-real-ip': '5.6.7.8',
        'x-forwarded-for': '9.10.11.12',
      },
    })
    expect(getClientIp(req)).toBe('1.2.3.4')
  })

  it('usa x-real-ip como fallback', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-real-ip': '5.6.7.8' },
    })
    expect(getClientIp(req)).toBe('5.6.7.8')
  })

  it('usa primeiro IP do x-forwarded-for', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' },
    })
    expect(getClientIp(req)).toBe('1.1.1.1')
  })

  it('retorna unknown sem headers', () => {
    const req = new Request('http://localhost')
    expect(getClientIp(req)).toBe('unknown')
  })
})

// ─── tooManyRequests ───────────────────────────────────────────────────────────

describe('tooManyRequests', () => {
  it('retorna status 429', () => {
    const res = tooManyRequests()
    expect(res.status).toBe(429)
  })

  it('inclui header Retry-After quando informado', () => {
    const res = tooManyRequests(30_000)
    expect(res.headers.get('Retry-After')).toBe('30')
  })

  it('não inclui Retry-After quando não informado', () => {
    const res = tooManyRequests()
    expect(res.headers.get('Retry-After')).toBeNull()
  })

  it('retorna corpo JSON com mensagem de erro', async () => {
    const res = tooManyRequests()
    const body = await res.json()
    expect(body.error).toContain('Muitas requisições')
  })
})
