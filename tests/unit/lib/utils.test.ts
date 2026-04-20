import { describe, it, expect } from 'vitest'
import {
  formatBRL,
  formatCPF,
  formatCNPJ,
  formatTelefone,
  formatDate,
  formatDateTime,
  validarCPF,
  validarCNPJ,
  getInitials,
  slugify,
} from '@/lib/utils'

// ─── formatBRL ─────────────────────────────────────────────────────────────────

describe('formatBRL', () => {
  it('formata número para BRL', () => {
    expect(formatBRL(1234.5)).toBe('R$\u00a01.234,50')
  })

  it('formata string numérica', () => {
    expect(formatBRL('99.9')).toBe('R$\u00a099,90')
  })

  it('retorna R$ 0,00 para null', () => {
    expect(formatBRL(null)).toBe('R$ 0,00')
  })

  it('retorna R$ 0,00 para undefined', () => {
    expect(formatBRL(undefined)).toBe('R$ 0,00')
  })

  it('formata zero', () => {
    expect(formatBRL(0)).toBe('R$\u00a00,00')
  })
})

// ─── formatCPF ─────────────────────────────────────────────────────────────────

describe('formatCPF', () => {
  it('formata CPF com pontos e traço', () => {
    expect(formatCPF('12345678901')).toBe('123.456.789-01')
  })

  it('limpa caracteres não numéricos antes de formatar', () => {
    expect(formatCPF('123.456.789-01')).toBe('123.456.789-01')
  })
})

// ─── formatCNPJ ────────────────────────────────────────────────────────────────

describe('formatCNPJ', () => {
  it('formata CNPJ completo', () => {
    expect(formatCNPJ('12345678000195')).toBe('12.345.678/0001-95')
  })
})

// ─── formatTelefone ────────────────────────────────────────────────────────────

describe('formatTelefone', () => {
  it('formata celular com 11 dígitos', () => {
    expect(formatTelefone('85981186338')).toBe('(85) 98118-6338')
  })

  it('formata fixo com 10 dígitos', () => {
    expect(formatTelefone('8532123456')).toBe('(85) 3212-3456')
  })
})

// ─── formatDate / formatDateTime ───────────────────────────────────────────────

describe('formatDate', () => {
  it('formata data ISO para dd/mm/aaaa', () => {
    // Usa data com horário UTC que garante mesmo dia em Brasília
    const result = formatDate('2026-03-15T12:00:00Z')
    expect(result).toBe('15/03/2026')
  })
})

describe('formatDateTime', () => {
  it('retorna data e hora com "às"', () => {
    const result = formatDateTime('2026-03-15T15:30:00Z')
    expect(result).toMatch(/15\/03\/2026 às \d{2}:\d{2}/)
  })
})

// ─── validarCPF ────────────────────────────────────────────────────────────────

describe('validarCPF', () => {
  it('aceita CPF válido', () => {
    expect(validarCPF('529.982.247-25')).toBe(true)
  })

  it('rejeita CPF com dígitos iguais', () => {
    expect(validarCPF('111.111.111-11')).toBe(false)
  })

  it('rejeita CPF com dígito verificador errado', () => {
    expect(validarCPF('529.982.247-26')).toBe(false)
  })

  it('rejeita CPF curto', () => {
    expect(validarCPF('1234')).toBe(false)
  })
})

// ─── validarCNPJ ───────────────────────────────────────────────────────────────

describe('validarCNPJ', () => {
  it('aceita CNPJ válido', () => {
    expect(validarCNPJ('11.222.333/0001-81')).toBe(true)
  })

  it('rejeita CNPJ com dígitos iguais', () => {
    expect(validarCNPJ('11.111.111/1111-11')).toBe(false)
  })

  it('rejeita CNPJ com dígito verificador errado', () => {
    expect(validarCNPJ('11.222.333/0001-82')).toBe(false)
  })
})

// ─── getInitials ───────────────────────────────────────────────────────────────

describe('getInitials', () => {
  it('retorna iniciais de nome completo', () => {
    expect(getInitials('Alisson Saraiva')).toBe('AS')
  })

  it('retorna uma inicial para nome simples', () => {
    expect(getInitials('Alisson')).toBe('A')
  })

  it('usa apenas as duas primeiras palavras', () => {
    expect(getInitials('João Carlos Silva')).toBe('JC')
  })
})

// ─── slugify ───────────────────────────────────────────────────────────────────

describe('slugify', () => {
  it('converte para slug', () => {
    expect(slugify('Olá Mundo!')).toBe('ola-mundo')
  })

  it('remove acentos', () => {
    expect(slugify('Ação é Reação')).toBe('acao-e-reacao')
  })

  it('não gera traço no início ou fim', () => {
    expect(slugify(' --test-- ')).toBe('test')
  })
})
