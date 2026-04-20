import { describe, it, expect } from 'vitest'
import { normalizarPhone } from '@/lib/utils/phone'

describe('normalizarPhone', () => {
  it('retorna variantes a partir de número completo com 9 dígito (13d)', () => {
    const result = normalizarPhone('5585981186338')
    expect(result).toContain('5585981186338')  // original
    expect(result).toContain('85981186338')    // sem 55
    expect(result).toContain('558581186338')   // sem 9 (12d)
    expect(result).toContain('8581186338')     // sem 55 + sem 9
  })

  it('retorna variantes a partir de número sem 9 dígito (12d)', () => {
    const result = normalizarPhone('558581186338')
    expect(result).toContain('558581186338')   // original
    expect(result).toContain('5585981186338')  // com 9 (13d)
    expect(result).toContain('85981186338')    // com 9 sem 55
  })

  it('limpa sufixo @s.whatsapp.net', () => {
    const result = normalizarPhone('5585981186338@s.whatsapp.net')
    expect(result).toContain('5585981186338')
    expect(result).toContain('558581186338')
  })

  it('filtra variantes menores que 8 dígitos', () => {
    const result = normalizarPhone('5585981186338')
    for (const v of result) {
      expect(v.length).toBeGreaterThanOrEqual(8)
    }
  })

  it('lida com número curto (apenas celular sem DDD)', () => {
    const result = normalizarPhone('981186338')
    expect(result).toContain('981186338')
  })
})
