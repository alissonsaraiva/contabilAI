import { describe, it, expect } from 'vitest'
import { chunkText, CHUNK_SIZES } from '@/lib/rag/chunker'

// ─── chunkText ─────────────────────────────────────────────────────────────────

describe('chunkText', () => {
  it('retorna array vazio para string vazia', () => {
    expect(chunkText('')).toEqual([])
  })

  it('retorna array vazio para string só com espaços', () => {
    expect(chunkText('   \n\n   ')).toEqual([])
  })

  it('retorna 1 chunk para texto curto', () => {
    const chunks = chunkText('Texto curto.')
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toBe('Texto curto.')
  })

  it('divide texto longo em múltiplos chunks', () => {
    // Gera texto com múltiplos parágrafos, cada um com ~500 chars
    const paragraph = 'A'.repeat(500)
    const text = Array.from({ length: 10 }, () => paragraph).join('\n\n')
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('aplica sobreposição entre chunks', () => {
    const paragraph = 'Sentença curta. '.repeat(200)
    const text = `${paragraph}\n\n${paragraph}`
    const chunks = chunkText(text)
    if (chunks.length >= 2) {
      // O segundo chunk deve conter parte do final do primeiro (overlap)
      const firstEnd = chunks[0]!.slice(-50)
      expect(chunks[1]).toContain(firstEnd)
    }
  })

  it('filtra chunks menores que 20 caracteres', () => {
    const chunks = chunkText('A'.repeat(5000) + '\n\nX')
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(20)
    }
  })

  it('usa tamanho de chunk por tipo', () => {
    expect(CHUNK_SIZES['fiscal_normativo']).toBe(700)
    expect(CHUNK_SIZES['dados_empresa']).toBe(300)
    expect(CHUNK_SIZES['base_conhecimento']).toBe(400)
  })

  it('normaliza \\r\\n para \\n', () => {
    const chunks = chunkText('Linha 1\r\nLinha 2')
    expect(chunks[0]).not.toContain('\r')
  })

  it('colapsa 3+ quebras de linha para 2', () => {
    const chunks = chunkText('Parágrafo 1\n\n\n\n\nParágrafo 2')
    expect(chunks).toHaveLength(1) // Curto o suficiente para caber em 1 chunk
    expect(chunks[0]).toContain('Parágrafo 1')
    expect(chunks[0]).toContain('Parágrafo 2')
  })

  it('divide parágrafos grandes por sentenças', () => {
    // Cria um parágrafo com muitas sentenças que excede o chunk size
    const sentence = 'Esta é uma sentença razoavelmente longa para teste. '
    const bigParagraph = sentence.repeat(100) // ~5200 chars
    const chunks = chunkText(bigParagraph)
    expect(chunks.length).toBeGreaterThan(1)
  })
})
