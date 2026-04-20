import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Pool } from 'pg'
import {
  storeEmbeddings,
  searchSimilar,
  searchHybrid,
  deleteBySourceId,
  deleteEmbeddings,
  getContentHash,
  listKnowledge,
} from '@/lib/rag/store'
import type { EmbeddingRow } from '@/lib/rag/store'

// Pool direto para queries de verificação
let pool: Pool

beforeAll(() => {
  pool = new Pool({
    connectionString: process.env.VECTORS_DATABASE_URL,
    max: 2,
  })
})

afterAll(async () => {
  await pool.end()
})

beforeEach(async () => {
  await pool.query('TRUNCATE TABLE vectors.embeddings')
})

// Helper: gera embedding de 512 dimensões com valor constante
function fakeEmbedding(seed = 0.1): number[] {
  return Array.from({ length: 512 }, (_, i) => Math.sin(i * seed))
}

// Helper: normaliza embedding para que cosine similarity funcione
function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0))
  return vec.map(v => v / norm)
}

// ─── storeEmbeddings ───────────────────────────────────────────────────────────

describe('storeEmbeddings', () => {
  it('insere embeddings no banco', async () => {
    const rows: EmbeddingRow[] = [
      { escopo: 'global', tipo: 'base_conhecimento', conteudo: 'O MEI deve pagar DAS mensalmente.' },
      { escopo: 'global', tipo: 'base_conhecimento', conteudo: 'O Simples Nacional unifica 8 tributos.' },
    ]
    const embeddings = [normalize(fakeEmbedding(0.1)), normalize(fakeEmbedding(0.2))]

    await storeEmbeddings(rows, embeddings)

    const { rows: dbRows } = await pool.query('SELECT count(*)::int as cnt FROM vectors.embeddings')
    expect(dbRows[0]?.cnt).toBe(2)
  })

  it('armazena metadata como JSON', async () => {
    const rows: EmbeddingRow[] = [{
      escopo: 'global',
      tipo: 'base_conhecimento',
      conteudo: 'Teste metadata',
      metadata: { sourceId: 'src-001', contentHash: 'abc123', chunkIndex: 0 },
    }]
    await storeEmbeddings(rows, [normalize(fakeEmbedding())])

    const { rows: dbRows } = await pool.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM vectors.embeddings LIMIT 1`,
    )
    expect(dbRows[0]?.metadata).toMatchObject({
      sourceId: 'src-001',
      contentHash: 'abc123',
      chunkIndex: 0,
    })
  })

  it('armazena canal e escopo corretamente', async () => {
    const rows: EmbeddingRow[] = [{
      escopo: 'cliente',
      canal: 'whatsapp',
      tipo: 'dados_empresa',
      clienteId: 'cli-123',
      conteudo: 'Dados do cliente',
    }]
    await storeEmbeddings(rows, [normalize(fakeEmbedding())])

    const { rows: dbRows } = await pool.query<{ escopo: string; canal: string; cliente_id: string }>(
      `SELECT escopo, canal, cliente_id FROM vectors.embeddings LIMIT 1`,
    )
    expect(dbRows[0]?.escopo).toBe('cliente')
    expect(dbRows[0]?.canal).toBe('whatsapp')
    expect(dbRows[0]?.cliente_id).toBe('cli-123')
  })
})

// ─── searchSimilar ─────────────────────────────────────────────────────────────

describe('searchSimilar', () => {
  const baseEmb = normalize(fakeEmbedding(0.1))
  const similarEmb = normalize(fakeEmbedding(0.101))  // muito próximo
  const differentEmb = normalize(fakeEmbedding(5.0))   // bem diferente

  beforeEach(async () => {
    await storeEmbeddings(
      [
        { escopo: 'global', tipo: 'base_conhecimento', conteudo: 'MEI paga DAS todo mês', titulo: 'DAS MEI' },
        { escopo: 'global', tipo: 'fiscal_normativo', conteudo: 'Texto normativo diferente' },
      ],
      [baseEmb, differentEmb],
    )
  })

  it('retorna resultados acima do threshold de similaridade', async () => {
    const results = await searchSimilar(similarEmb, { minSimilarity: 0.5 })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0]!.similarity).toBeGreaterThan(0.5)
  })

  it('filtra por tipo', async () => {
    const results = await searchSimilar(similarEmb, {
      tipos: ['base_conhecimento'],
      minSimilarity: 0.1,
    })
    for (const r of results) {
      expect(r.tipo).toBe('base_conhecimento')
    }
  })

  it('filtra por escopo', async () => {
    // Adiciona um de escopo cliente
    await storeEmbeddings(
      [{ escopo: 'cliente', tipo: 'dados_empresa', clienteId: 'cli-x', conteudo: 'Dados cliente X' }],
      [normalize(fakeEmbedding(0.102))],
    )
    const results = await searchSimilar(similarEmb, { escopo: 'cliente', minSimilarity: 0.1 })
    for (const r of results) {
      expect(r.escopo).toBe('cliente')
    }
  })

  it('respeita limit', async () => {
    const results = await searchSimilar(similarEmb, { limit: 1, minSimilarity: 0.1 })
    expect(results.length).toBeLessThanOrEqual(1)
  })
})

// ─── searchHybrid ──────────────────────────────────────────────────────────────

describe('searchHybrid', () => {
  beforeEach(async () => {
    await storeEmbeddings(
      [
        { escopo: 'global', tipo: 'base_conhecimento', conteudo: 'O CNPJ 12.345.678/0001-90 pertence à empresa ACME LTDA' },
        { escopo: 'global', tipo: 'base_conhecimento', conteudo: 'Regime tributário Simples Nacional unifica tributos' },
      ],
      [normalize(fakeEmbedding(0.3)), normalize(fakeEmbedding(0.4))],
    )
  })

  it('encontra resultados via keyword matching', async () => {
    const results = await searchHybrid(
      normalize(fakeEmbedding(0.5)),  // embedding irrelevante
      'CNPJ ACME',                     // mas keyword bate
      { minSimilarity: 0.01 },
    )
    expect(results.length).toBeGreaterThanOrEqual(1)
    const found = results.find(r => r.conteudo.includes('ACME'))
    expect(found).toBeDefined()
  })

  it('combina resultados semânticos e keyword via RRF', async () => {
    const results = await searchHybrid(
      normalize(fakeEmbedding(0.3)),  // embedding próximo do primeiro
      'Simples Nacional',              // keyword do segundo
      { minSimilarity: 0.01 },
    )
    // Ambos os documentos devem aparecer (um via semântico, outro via keyword)
    expect(results.length).toBeGreaterThanOrEqual(1)
  })
})

// ─── deleteBySourceId ──────────────────────────────────────────────────────────

describe('deleteBySourceId', () => {
  it('deleta todos os chunks de um sourceId', async () => {
    await storeEmbeddings(
      [
        { escopo: 'global', tipo: 'base_conhecimento', conteudo: 'Chunk 1', metadata: { sourceId: 'art-001', chunkIndex: 0 } },
        { escopo: 'global', tipo: 'base_conhecimento', conteudo: 'Chunk 2', metadata: { sourceId: 'art-001', chunkIndex: 1 } },
        { escopo: 'global', tipo: 'base_conhecimento', conteudo: 'Outro artigo', metadata: { sourceId: 'art-002', chunkIndex: 0 } },
      ],
      [normalize(fakeEmbedding(0.1)), normalize(fakeEmbedding(0.2)), normalize(fakeEmbedding(0.3))],
    )

    await deleteBySourceId('art-001')

    const { rows } = await pool.query<{ cnt: number }>('SELECT count(*)::int as cnt FROM vectors.embeddings')
    expect(rows[0]?.cnt).toBe(1)
  })
})

// ─── deleteEmbeddings ──────────────────────────────────────────────────────────

describe('deleteEmbeddings', () => {
  it('deleta por clienteId', async () => {
    await storeEmbeddings(
      [
        { escopo: 'cliente', tipo: 'dados_empresa', clienteId: 'cli-del', conteudo: 'Dados para deletar' },
        { escopo: 'global', tipo: 'base_conhecimento', conteudo: 'Não deve ser deletado' },
      ],
      [normalize(fakeEmbedding(0.1)), normalize(fakeEmbedding(0.2))],
    )

    await deleteEmbeddings({ clienteId: 'cli-del' })

    const { rows } = await pool.query<{ cnt: number }>('SELECT count(*)::int as cnt FROM vectors.embeddings')
    expect(rows[0]?.cnt).toBe(1)
  })

  it('não deleta nada se nenhuma condição for informada', async () => {
    await storeEmbeddings(
      [{ escopo: 'global', tipo: 'base_conhecimento', conteudo: 'Deve permanecer' }],
      [normalize(fakeEmbedding())],
    )

    await deleteEmbeddings({})

    const { rows } = await pool.query<{ cnt: number }>('SELECT count(*)::int as cnt FROM vectors.embeddings')
    expect(rows[0]?.cnt).toBe(1)
  })
})

// ─── getContentHash ────────────────────────────────────────────────────────────

describe('getContentHash', () => {
  it('retorna hash armazenado no metadata', async () => {
    await storeEmbeddings(
      [{ escopo: 'global', tipo: 'base_conhecimento', documentoId: 'doc-hash', conteudo: 'Conteúdo', metadata: { contentHash: 'md5abc' } }],
      [normalize(fakeEmbedding())],
    )

    const hash = await getContentHash('doc-hash')
    expect(hash).toBe('md5abc')
  })

  it('retorna null para documento não indexado', async () => {
    const hash = await getContentHash('inexistente')
    expect(hash).toBeNull()
  })
})

// ─── listKnowledge ─────────────────────────────────────────────────────────────

describe('listKnowledge', () => {
  it('lista artigos globais (chunk 0 com sourceId)', async () => {
    await storeEmbeddings(
      [
        { escopo: 'global', tipo: 'base_conhecimento', titulo: 'Artigo 1', conteudo: 'Conteúdo do artigo 1', metadata: { sourceId: 'kb-001', chunkIndex: 0, totalChunks: '2' } },
        { escopo: 'global', tipo: 'base_conhecimento', conteudo: 'Chunk 2 do artigo 1', metadata: { sourceId: 'kb-001', chunkIndex: 1, totalChunks: '2' } },
      ],
      [normalize(fakeEmbedding(0.1)), normalize(fakeEmbedding(0.2))],
    )

    const entries = await listKnowledge()
    expect(entries).toHaveLength(1)
    expect(entries[0]!.sourceId).toBe('kb-001')
    expect(entries[0]!.titulo).toBe('Artigo 1')
    expect(entries[0]!.totalChunks).toBe(2)
  })

  it('filtra por tipo', async () => {
    await storeEmbeddings(
      [
        { escopo: 'global', tipo: 'base_conhecimento', conteudo: 'KB', metadata: { sourceId: 'kb-f1', chunkIndex: 0 } },
        { escopo: 'global', tipo: 'fiscal_normativo', conteudo: 'Fiscal', metadata: { sourceId: 'fn-f1', chunkIndex: 0 } },
      ],
      [normalize(fakeEmbedding(0.1)), normalize(fakeEmbedding(0.2))],
    )

    const entries = await listKnowledge({ tipo: 'fiscal_normativo' })
    expect(entries).toHaveLength(1)
    expect(entries[0]!.tipo).toBe('fiscal_normativo')
  })
})
