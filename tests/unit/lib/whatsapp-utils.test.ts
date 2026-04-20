import { describe, it, expect } from 'vitest'
import { buildRemoteJid, isMediaUrlTrusted, checkRateLimit, WHATSAPP_ALLOWED_MIME } from '@/lib/whatsapp-utils'

// ─── buildRemoteJid ────────────────────────────────────────────────────────────

describe('buildRemoteJid', () => {
  it('adiciona 55 e @s.whatsapp.net para número sem código de país', () => {
    expect(buildRemoteJid('85981186338')).toBe('5585981186338@s.whatsapp.net')
  })

  it('não duplica 55 se já presente', () => {
    expect(buildRemoteJid('5585981186338')).toBe('5585981186338@s.whatsapp.net')
  })

  it('limpa caracteres não numéricos', () => {
    expect(buildRemoteJid('(85) 98118-6338')).toBe('5585981186338@s.whatsapp.net')
  })

  it('retorna null para número muito curto', () => {
    expect(buildRemoteJid('1234567')).toBeNull()
  })

  it('retorna null para número muito longo', () => {
    expect(buildRemoteJid('12345678901234')).toBeNull()
  })

  it('aceita número com 8 dígitos (fixo sem DDD)', () => {
    expect(buildRemoteJid('32123456')).toBe('5532123456@s.whatsapp.net')
  })
})

// ─── isMediaUrlTrusted ─────────────────────────────────────────────────────────

describe('isMediaUrlTrusted', () => {
  it('aceita URL do domínio configurado no env', () => {
    expect(isMediaUrlTrusted('https://storage.test.example.com/file.pdf')).toBe(true)
  })

  it('rejeita URL de domínio diferente', () => {
    expect(isMediaUrlTrusted('https://evil.com/file.pdf')).toBe(false)
  })

  it('rejeita URL inválida', () => {
    expect(isMediaUrlTrusted('not-a-url')).toBe(false)
  })
})

// ─── checkRateLimit ────────────────────────────────────────────────────────────

describe('checkRateLimit', () => {
  it('permite a primeira requisição', () => {
    const result = checkRateLimit('test-user-unique-1')
    expect(result.ok).toBe(true)
  })

  it('permite múltiplas requisições abaixo do limite', () => {
    const userId = 'test-user-unique-2'
    for (let i = 0; i < 29; i++) {
      checkRateLimit(userId)
    }
    expect(checkRateLimit(userId).ok).toBe(true)
  })
})

// ─── WHATSAPP_ALLOWED_MIME ─────────────────────────────────────────────────────

describe('WHATSAPP_ALLOWED_MIME', () => {
  it('inclui PDF', () => {
    expect(WHATSAPP_ALLOWED_MIME.has('application/pdf')).toBe(true)
  })

  it('inclui imagens comuns', () => {
    expect(WHATSAPP_ALLOWED_MIME.has('image/jpeg')).toBe(true)
    expect(WHATSAPP_ALLOWED_MIME.has('image/png')).toBe(true)
  })

  it('não inclui executáveis', () => {
    expect(WHATSAPP_ALLOWED_MIME.has('application/x-msdownload')).toBe(false)
  })
})
