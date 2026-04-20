import { describe, it, expect } from 'vitest'
import { removeAccents } from '@/lib/search'

describe('removeAccents', () => {
  it('remove acentos agudos', () => {
    expect(removeAccents('café')).toBe('cafe')
  })

  it('remove til', () => {
    expect(removeAccents('João')).toBe('Joao')
  })

  it('remove cedilha', () => {
    expect(removeAccents('ação')).toBe('acao')
  })

  it('remove trema', () => {
    expect(removeAccents('über')).toBe('uber')
  })

  it('remove circunflexo', () => {
    expect(removeAccents('você')).toBe('voce')
  })

  it('preserva caracteres sem acento', () => {
    expect(removeAccents('hello world')).toBe('hello world')
  })

  it('preserva números', () => {
    expect(removeAccents('Nota 123')).toBe('Nota 123')
  })

  it('lida com string vazia', () => {
    expect(removeAccents('')).toBe('')
  })

  it('remove múltiplos acentos', () => {
    expect(removeAccents('Açúcar é Doçura')).toBe('Acucar e Docura')
  })
})
