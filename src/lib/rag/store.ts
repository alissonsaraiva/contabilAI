import { Pool } from 'pg'
import type { EscopoRAG, TipoConhecimento, CanalRAG } from './types'

// Pool dedicado ao banco de vetores (contabai_vectors — pgvector/pgvector:pg17)
// Usa VECTORS_DATABASE_URL; se não configurada, tenta DATABASE_URL como fallback
let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    const url = process.env.VECTORS_DATABASE_URL || process.env.DATABASE_URL
    if (!url) throw new Error('VECTORS_DATABASE_URL ou DATABASE_URL não configurada')
    pool = new Pool({ connectionString: url, max: 5 })
  }
  return pool
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type EmbeddingRow = {
  escopo: EscopoRAG
  canal?: CanalRAG         // qual IA usa — null = 'geral'
  tipo: TipoConhecimento
  clienteId?: string | null
  leadId?: string | null
  documentoId?: string | null
  titulo?: string | null
  conteudo: string
  metadata?: Record<string, unknown> | null
}

export type SearchResult = {
  id: string
  escopo: EscopoRAG
  canal: CanalRAG
  tipo: TipoConhecimento
  titulo: string | null
  conteudo: string
  similarity: number
  clienteId: string | null
  leadId: string | null
  metadata: Record<string, unknown> | null
}

export type SearchOpts = {
  // Filtros de escopo
  escopo?: EscopoRAG | EscopoRAG[]
  clienteId?: string       // filtra por cliente (escopo cliente)
  leadId?: string          // filtra por lead (escopo lead)
  incluirGlobal?: boolean  // inclui base global junto com escopo cliente/lead

  // Filtro de canal — retorna o canal solicitado + 'geral'
  canal?: CanalRAG

  // Filtros de tipo
  tipos?: TipoConhecimento[]

  // Controle de resultado
  limit?: number
  minSimilarity?: number
}

// ─── Operações ───────────────────────────────────────────────────────────────

export async function storeEmbeddings(
  rows: EmbeddingRow[],
  embeddings: number[][],
): Promise<void> {
  const db = getPool()
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const vec = `[${embeddings[i].join(',')}]`
      await client.query(
        `INSERT INTO vectors.embeddings
           (escopo, canal, tipo, cliente_id, lead_id, documento_id, titulo, conteudo, embedding, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::vector,$10)`,
        [
          r.escopo,
          r.canal ?? 'geral',
          r.tipo,
          r.clienteId ?? null,
          r.leadId ?? null,
          r.documentoId ?? null,
          r.titulo ?? null,
          r.conteudo,
          vec,
          r.metadata ? JSON.stringify(r.metadata) : null,
        ],
      )
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function searchSimilar(
  embedding: number[],
  opts: SearchOpts = {},
): Promise<SearchResult[]> {
  const db = getPool()
  const vec = `[${embedding.join(',')}]`
  const limit = opts.limit ?? 5
  const minSim = opts.minSimilarity ?? 0.5

  const conditions: string[] = []
  const values: unknown[] = [vec, limit]
  let idx = 3

  // Filtro de escopo
  if (opts.incluirGlobal && (opts.clienteId || opts.leadId)) {
    // Retorna itens globais OU do cliente/lead específico
    const orParts: string[] = [`escopo = 'global'`]
    if (opts.clienteId) {
      orParts.push(`(escopo = 'cliente' AND cliente_id = $${idx++})`)
      values.push(opts.clienteId)
    }
    if (opts.leadId) {
      orParts.push(`(escopo = 'lead' AND lead_id = $${idx++})`)
      values.push(opts.leadId)
    }
    conditions.push(`(${orParts.join(' OR ')})`)
  } else {
    if (opts.clienteId) {
      conditions.push(`cliente_id = $${idx++}`)
      values.push(opts.clienteId)
    }
    if (opts.leadId) {
      conditions.push(`lead_id = $${idx++}`)
      values.push(opts.leadId)
    }
    if (opts.escopo) {
      const escopos = Array.isArray(opts.escopo) ? opts.escopo : [opts.escopo]
      conditions.push(`escopo = ANY($${idx++}::text[])`)
      values.push(escopos)
    }
  }

  // Filtro de canal — canal solicitado OU 'geral'
  if (opts.canal && opts.canal !== 'geral') {
    conditions.push(`canal = ANY($${idx++}::text[])`)
    values.push([opts.canal, 'geral'])
  }

  // Filtro de tipos
  if (opts.tipos?.length) {
    conditions.push(`tipo = ANY($${idx++}::text[])`)
    values.push(opts.tipos)
  }

  const where = conditions.length ? `AND ${conditions.join(' AND ')}` : ''

  const { rows } = await db.query<{
    id: string
    escopo: EscopoRAG
    canal: CanalRAG
    tipo: TipoConhecimento
    titulo: string | null
    conteudo: string
    similarity: number
    cliente_id: string | null
    lead_id: string | null
    metadata: Record<string, unknown> | null
  }>(
    `SELECT
       id, escopo, canal, tipo, titulo, conteudo, cliente_id, lead_id, metadata,
       1 - (embedding <=> $1::vector) AS similarity
     FROM vectors.embeddings
     WHERE 1 - (embedding <=> $1::vector) >= ${minSim}
       ${where}
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    values,
  )

  return rows.map(r => ({
    id: r.id,
    escopo: r.escopo,
    canal: r.canal ?? 'geral',
    tipo: r.tipo,
    titulo: r.titulo,
    conteudo: r.conteudo,
    similarity: r.similarity,
    clienteId: r.cliente_id,
    leadId: r.lead_id,
    metadata: r.metadata,
  }))
}

// ─── Listagem da base de conhecimento ────────────────────────────────────────

export type KnowledgeEntry = {
  sourceId: string
  canal: CanalRAG
  tipo: TipoConhecimento
  titulo: string | null
  preview: string      // primeiros 200 chars do conteúdo
  totalChunks: number
  criadoEm: Date
}

// Lista artigos únicos da base global — mostra apenas o chunk 0 de cada sourceId
// Exclui entradas automáticas (escritório, planos) que não têm sourceId
export async function listKnowledge(opts: {
  canal?: CanalRAG
  tipo?: TipoConhecimento
} = {}): Promise<KnowledgeEntry[]> {
  const db = getPool()
  const conditions = [`escopo = 'global'`, `(metadata->>'chunkIndex')::int = 0`, `metadata->>'sourceId' IS NOT NULL`]
  const values: unknown[] = []
  let idx = 1

  if (opts.canal) {
    conditions.push(`canal = $${idx++}`)
    values.push(opts.canal)
  }
  if (opts.tipo) {
    conditions.push(`tipo = $${idx++}`)
    values.push(opts.tipo)
  }

  const { rows } = await db.query<{
    source_id: string
    canal: CanalRAG
    tipo: TipoConhecimento
    titulo: string | null
    conteudo: string
    total_chunks: string
    criado_em: Date
  }>(
    `SELECT
       metadata->>'sourceId' AS source_id,
       canal,
       tipo,
       titulo,
       conteudo,
       (metadata->>'totalChunks') AS total_chunks,
       criado_em
     FROM vectors.embeddings
     WHERE ${conditions.join(' AND ')}
     ORDER BY criado_em DESC
     LIMIT 200`,
    values,
  )

  return rows.map(r => ({
    sourceId: r.source_id,
    canal: r.canal ?? 'geral',
    tipo: r.tipo,
    titulo: r.titulo,
    preview: r.conteudo.slice(0, 200),
    totalChunks: parseInt(r.total_chunks ?? '1', 10),
    criadoEm: r.criado_em,
  }))
}

// Deleta todos os chunks de um artigo pelo sourceId
export async function deleteBySourceId(sourceId: string): Promise<void> {
  const db = getPool()
  await db.query(
    `DELETE FROM vectors.embeddings WHERE metadata->>'sourceId' = $1`,
    [sourceId],
  )
}

/**
 * Retorna o MD5 hash do conteúdo armazenado para um documentoId.
 * Usado para dirty check antes de re-indexar — evita chamadas de embedding desnecessárias.
 * Retorna null se o documento não está indexado ou não tem hash (entradas legadas).
 */
export async function getContentHash(documentoId: string): Promise<string | null> {
  const db = getPool()
  const { rows } = await db.query<{ hash: string | null }>(
    `SELECT metadata->>'contentHash' AS hash FROM vectors.embeddings WHERE documento_id = $1 LIMIT 1`,
    [documentoId],
  )
  return rows[0]?.hash ?? null
}

export async function deleteEmbeddings(opts: {
  clienteId?: string
  leadId?: string
  documentoId?: string
  tipo?: TipoConhecimento
}): Promise<void> {
  const db = getPool()
  const conditions: string[] = []
  const values: unknown[] = []
  let idx = 1
  if (opts.clienteId)   { conditions.push(`cliente_id = $${idx++}`);  values.push(opts.clienteId) }
  if (opts.leadId)      { conditions.push(`lead_id = $${idx++}`);     values.push(opts.leadId) }
  if (opts.documentoId) { conditions.push(`documento_id = $${idx++}`); values.push(opts.documentoId) }
  if (opts.tipo)        { conditions.push(`tipo = $${idx++}`);         values.push(opts.tipo) }
  if (!conditions.length) return
  await db.query(`DELETE FROM vectors.embeddings WHERE ${conditions.join(' AND ')}`, values)
}
