import { describe, it, expect, beforeAll } from 'vitest'
import { encrypt, decrypt, isEncrypted, maskKey } from '@/lib/crypto'

// ENCRYPTION_KEY precisa ser 64 hex chars (256 bits)
beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64)
})

// ─── encrypt / decrypt round-trip ──────────────────────────────────────────────

describe('encrypt / decrypt', () => {
  it('round-trip: decrypt(encrypt(x)) === x', () => {
    const plain = 'minha-api-key-super-secreta'
    const encrypted = encrypt(plain)
    expect(decrypt(encrypted)).toBe(plain)
  })

  it('gera outputs diferentes para o mesmo input (IV aleatório)', () => {
    const plain = 'test'
    const a = encrypt(plain)
    const b = encrypt(plain)
    expect(a).not.toBe(b)
  })

  it('formato de saída é iv:authTag:ciphertext', () => {
    const encrypted = encrypt('test')
    const parts = encrypted.split(':')
    expect(parts).toHaveLength(3)
  })

  it('lança erro para formato inválido no decrypt', () => {
    expect(() => decrypt('invalid')).toThrow()
  })

  it('lança erro para dados corrompidos no decrypt', () => {
    const encrypted = encrypt('test')
    const parts = encrypted.split(':')
    // Corrompe o ciphertext
    const corrupted = `${parts[0]}:${parts[1]}:AAAA`
    expect(() => decrypt(corrupted)).toThrow()
  })
})

// ─── isEncrypted ───────────────────────────────────────────────────────────────

describe('isEncrypted', () => {
  it('reconhece output do encrypt()', () => {
    const encrypted = encrypt('test')
    expect(isEncrypted(encrypted)).toBe(true)
  })

  it('rejeita string simples', () => {
    expect(isEncrypted('sk-ant-api03-abc123')).toBe(false)
  })

  it('rejeita string vazia', () => {
    expect(isEncrypted('')).toBe(false)
  })

  it('rejeita formato com 2 partes', () => {
    expect(isEncrypted('abc:def')).toBe(false)
  })

  it('rejeita formato com IV de tamanho errado', () => {
    expect(isEncrypted('short:' + 'A'.repeat(24) + ':AAAA')).toBe(false)
  })
})

// ─── maskKey ───────────────────────────────────────────────────────────────────

describe('maskKey', () => {
  it('mascara string longa mostrando últimos 4 caracteres', () => {
    const result = maskKey('sk-ant-api03-abcdef1234')
    expect(result).toBe('••••••••••••1234')
  })

  it('retorna bullets para string curta', () => {
    expect(maskKey('abc')).toBe('••••••••')
  })

  it('retorna bullets para string vazia', () => {
    expect(maskKey('')).toBe('••••••••')
  })

  it('descriptografa valor encriptado para exibir últimos 4 chars', () => {
    const encrypted = encrypt('minha-chave-9876')
    const result = maskKey(encrypted)
    expect(result).toBe('••••••••••••9876')
  })
})
