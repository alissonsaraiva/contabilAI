import { describe, it, expect } from 'vitest'
import { resolverPermissoes, podeAcessarRota, DEFAULT_PERMISSOES } from '@/lib/menu-permissoes'

// ─── resolverPermissoes ────────────────────────────────────────────────────────

describe('resolverPermissoes', () => {
  it('retorna defaults para null', () => {
    const result = resolverPermissoes(null)
    expect(result.contador).toEqual(DEFAULT_PERMISSOES.contador)
    expect(result.assistente).toEqual(DEFAULT_PERMISSOES.assistente)
  })

  it('retorna defaults para undefined', () => {
    const result = resolverPermissoes(undefined)
    expect(result.contador).toEqual(DEFAULT_PERMISSOES.contador)
  })

  it('retorna defaults para array', () => {
    const result = resolverPermissoes([1, 2])
    expect(result.contador).toEqual(DEFAULT_PERMISSOES.contador)
  })

  it('usa lista salva quando válida', () => {
    const stored = {
      contador: ['/crm/dashboard', '/crm/clientes'],
      assistente: ['/crm/dashboard'],
    }
    const result = resolverPermissoes(stored)
    expect(result.contador).toEqual(['/crm/dashboard', '/crm/clientes'])
    expect(result.assistente).toEqual(['/crm/dashboard'])
  })

  it('usa default para role com valor não-array', () => {
    const stored = { contador: 'invalid', assistente: ['/crm/dashboard'] }
    const result = resolverPermissoes(stored)
    expect(result.contador).toEqual(DEFAULT_PERMISSOES.contador)
    expect(result.assistente).toEqual(['/crm/dashboard'])
  })

  it('retorna cópia, não referência (imutável)', () => {
    const result = resolverPermissoes(null)
    result.contador.push('/crm/hack')
    expect(DEFAULT_PERMISSOES.contador).not.toContain('/crm/hack')
  })
})

// ─── podeAcessarRota ───────────────────────────────────────────────────────────

describe('podeAcessarRota', () => {
  const perms = resolverPermissoes(null)

  it('admin sempre tem acesso', () => {
    expect(podeAcessarRota('admin', '/crm/qualquer-coisa', perms)).toBe(true)
  })

  it('admin acessa até rotas inexistentes', () => {
    expect(podeAcessarRota('admin', '/crm/xyz/abc', perms)).toBe(true)
  })

  it('contador acessa rota na sua lista', () => {
    expect(podeAcessarRota('contador', '/crm/dashboard', perms)).toBe(true)
  })

  it('contador acessa subrota de item permitido', () => {
    expect(podeAcessarRota('contador', '/crm/clientes/abc-123', perms)).toBe(true)
  })

  it('contador NÃO acessa rota fora da lista', () => {
    expect(podeAcessarRota('contador', '/crm/configuracoes', perms)).toBe(false)
  })

  it('assistente acessa rota na sua lista', () => {
    expect(podeAcessarRota('assistente', '/crm/dashboard', perms)).toBe(true)
  })

  it('assistente NÃO acessa financeiro/reajuste (não está nos defaults)', () => {
    expect(podeAcessarRota('assistente', '/crm/financeiro/reajuste', perms)).toBe(false)
  })

  it('permissão personalizada restringe acesso', () => {
    const custom = resolverPermissoes({
      contador: ['/crm/dashboard'],
      assistente: [],
    })
    expect(podeAcessarRota('contador', '/crm/clientes', custom)).toBe(false)
    expect(podeAcessarRota('assistente', '/crm/dashboard', custom)).toBe(false)
  })
})
