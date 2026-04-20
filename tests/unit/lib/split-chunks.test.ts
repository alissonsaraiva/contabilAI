import { describe, it, expect } from 'vitest'
import { stripMarkdown, splitIntoChunks, calcTypingDelay } from '@/lib/utils/split-chunks'

// ─── stripMarkdown ─────────────────────────────────────────────────────────────

describe('stripMarkdown', () => {
  it('remove bold (**)', () => {
    expect(stripMarkdown('Olá **mundo**')).toBe('Olá mundo')
  })

  it('remove italic (*)', () => {
    expect(stripMarkdown('Olá *mundo*')).toBe('Olá mundo')
  })

  it('remove headers (#)', () => {
    expect(stripMarkdown('## Título\nTexto')).toBe('Título\nTexto')
  })

  it('remove code blocks (```)', () => {
    expect(stripMarkdown('Antes\n```js\nconst x = 1\n```\nDepois')).toBe('Antes\n\nDepois')
  })

  it('remove inline code (`)', () => {
    expect(stripMarkdown('Use `npm install`')).toBe('Use npm install')
  })

  it('converte links markdown para texto', () => {
    expect(stripMarkdown('[Google](https://google.com)')).toBe('Google')
  })

  it('converte bullets - para •', () => {
    expect(stripMarkdown('- Item 1\n- Item 2')).toBe('• Item 1\n• Item 2')
  })

  it('colapsa linhas em branco excessivas', () => {
    expect(stripMarkdown('A\n\n\n\nB')).toBe('A\n\nB')
  })
})

// ─── splitIntoChunks ───────────────────────────────────────────────────────────

describe('splitIntoChunks', () => {
  it('divide texto por parágrafos (\n\n)', () => {
    const chunks = splitIntoChunks('Parágrafo 1\n\nParágrafo 2')
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toBe('Parágrafo 1')
    expect(chunks[1]).toBe('Parágrafo 2')
  })

  it('remove markdown antes de dividir', () => {
    const chunks = splitIntoChunks('**Bold text**\n\n*Italic text*')
    expect(chunks[0]).toBe('Bold text')
    expect(chunks[1]).toBe('Italic text')
  })

  it('retorna array vazio para string vazia', () => {
    expect(splitIntoChunks('')).toHaveLength(0)
  })

  it('subdivide parágrafos muito longos por \\n simples', () => {
    const longLine = 'A'.repeat(2000)
    const longParagraph = `${longLine}\n${longLine}\n${longLine}`
    const chunks = splitIntoChunks(longParagraph)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4000)
    }
  })
})

// ─── calcTypingDelay ───────────────────────────────────────────────────────────

describe('calcTypingDelay', () => {
  it('respeita mínimo', () => {
    expect(calcTypingDelay('Oi')).toBeGreaterThanOrEqual(1000)
  })

  it('respeita máximo', () => {
    expect(calcTypingDelay('A'.repeat(10000))).toBeLessThanOrEqual(3500)
  })

  it('é proporcional ao tamanho do texto', () => {
    const short = calcTypingDelay('Oi')
    const long = calcTypingDelay('A'.repeat(100))
    expect(long).toBeGreaterThan(short)
  })
})
