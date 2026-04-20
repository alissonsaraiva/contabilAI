import { describe, it, expect } from 'vitest'
import { parseDadosJson, getDadosString, getNomeFromDadosJson } from '@/lib/schemas/lead-dados-json'

// ─── parseDadosJson ────────────────────────────────────────────────────────────

describe('parseDadosJson', () => {
  it('retorna objeto quando input é válido', () => {
    expect(parseDadosJson({ nome: 'João' })).toEqual({ nome: 'João' })
  })

  it('retorna {} para null', () => {
    expect(parseDadosJson(null)).toEqual({})
  })

  it('retorna {} para undefined', () => {
    expect(parseDadosJson(undefined)).toEqual({})
  })

  it('retorna {} para array', () => {
    expect(parseDadosJson([1, 2, 3])).toEqual({})
  })

  it('retorna {} para string', () => {
    expect(parseDadosJson('texto')).toEqual({})
  })

  it('retorna {} para número', () => {
    expect(parseDadosJson(42)).toEqual({})
  })

  it('preserva valores mistos', () => {
    const input = { nome: 'Ana', idade: 30, ativo: true }
    expect(parseDadosJson(input)).toEqual(input)
  })
})

// ─── getDadosString ────────────────────────────────────────────────────────────

describe('getDadosString', () => {
  it('retorna valor da primeira chave encontrada', () => {
    const dados = { nome: 'João', nomeCompleto: 'João Silva' }
    expect(getDadosString(dados, 'nomeCompleto', 'nome')).toBe('João Silva')
  })

  it('tenta chaves em ordem de prioridade', () => {
    const dados = { nome: 'João' }
    expect(getDadosString(dados, 'nomeCompleto', 'nome')).toBe('João')
  })

  it('retorna undefined quando nenhuma chave existe', () => {
    expect(getDadosString({}, 'nome', 'email')).toBeUndefined()
  })

  it('ignora valores não-string', () => {
    const dados = { nome: 42 }
    expect(getDadosString(dados as Record<string, unknown>, 'nome')).toBeUndefined()
  })

  it('ignora strings vazias', () => {
    const dados = { nome: '  ', email: 'a@b.com' }
    expect(getDadosString(dados, 'nome', 'email')).toBe('a@b.com')
  })

  it('faz trim do resultado', () => {
    const dados = { nome: '  João  ' }
    expect(getDadosString(dados, 'nome')).toBe('João')
  })
})

// ─── getNomeFromDadosJson ──────────────────────────────────────────────────────

describe('getNomeFromDadosJson', () => {
  it('prioriza nomeCompleto (widget WhatsApp legado)', () => {
    const raw = { nomeCompleto: 'João Silva', nome: 'João' }
    expect(getNomeFromDadosJson(raw)).toBe('João Silva')
  })

  it('usa nome como fallback', () => {
    expect(getNomeFromDadosJson({ nome: 'Ana' })).toBe('Ana')
  })

  it('usa "Nome completo" (wizard CRM PF)', () => {
    expect(getNomeFromDadosJson({ 'Nome completo': 'Carlos' })).toBe('Carlos')
  })

  it('usa "Razão Social / Nome" (wizard CRM PJ)', () => {
    expect(getNomeFromDadosJson({ 'Razão Social / Nome': 'ACME LTDA' })).toBe('ACME LTDA')
  })

  it('usa "Razão Social" (campo avulso)', () => {
    expect(getNomeFromDadosJson({ 'Razão Social': 'Corp SA' })).toBe('Corp SA')
  })

  it('retorna undefined para objeto vazio', () => {
    expect(getNomeFromDadosJson({})).toBeUndefined()
  })

  it('retorna undefined para null', () => {
    expect(getNomeFromDadosJson(null)).toBeUndefined()
  })
})
