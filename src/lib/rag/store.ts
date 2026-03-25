import { Pool } from 'pg'
import type { EscopoRAG, TipoConhecimento } from './types'

// Pool dedicado ao banco de vetores (contabai_vectors — pgvector/pgvector:pg17)
// Usa VECTORS_DATABASE_URL; se não configurada, tenta DATABASE_URL como fallback
let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    const url = process.env.VECTORS_DATABASE_URL ?? process.env.DATABASE_URL
    if (!url) throw new Error('VECTORS_DATABASE_URL ou DATABASE_URL não configurada')
    pool = new Pool({ connectionString: url, max: 5 })
  }
  return pool
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type EmbeddingRow = {
  escopo: EscopoRAG
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
           (escopo, tipo, cliente_id, lead_id, documento_id, titulo, conteudo, embedding, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::vector,$9)`,
        [
          r.escopo,
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

  // Filtro de tipos
  if (opts.tipos?.length) {
    conditions.push(`tipo = ANY($${idx++}::text[])`)
    values.push(opts.tipos)
  }

  const where = conditions.length ? `AND ${conditions.join(' AND ')}` : ''

  const { rows } = await db.query<{
    id: string
    escopo: EscopoRAG
    tipo: TipoConhecimento
    titulo: string | null
    conteudo: string
    similarity: number
    cliente_id: string | null
    lead_id: string | null
    metadata: Record<string, unknown> | null
  }>(
    `SELECT
       id, escopo, tipo, titulo, conteudo, cliente_id, lead_id, metadata,
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
    tipo: r.tipo,
    titulo: r.titulo,
    conteudo: r.conteudo,
    similarity: r.similarity,
    clienteId: r.cliente_id,
    leadId: r.lead_id,
    metadata: r.metadata,
  }))
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
