import { Pool } from 'pg'

// Pool dedicado ao banco de vetores (pgvector)
let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    const url = process.env.VECTORS_DATABASE_URL
    if (!url) throw new Error('VECTORS_DATABASE_URL não configurada')
    pool = new Pool({ connectionString: url, max: 5 })
  }
  return pool
}

export type EmbeddingRow = {
  id?: string
  clienteId?: string | null
  leadId?: string | null
  documentoId?: string | null
  tipo: string
  titulo?: string | null
  conteudo: string
  metadata?: Record<string, unknown> | null
}

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
        `INSERT INTO embeddings
           (cliente_id, lead_id, documento_id, tipo, titulo, conteudo, embedding, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7::vector,$8)`,
        [
          r.clienteId ?? null,
          r.leadId ?? null,
          r.documentoId ?? null,
          r.tipo,
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

export type SearchResult = {
  id: string
  tipo: string
  titulo: string | null
  conteudo: string
  similarity: number
  clienteId: string | null
  leadId: string | null
  metadata: Record<string, unknown> | null
}

export async function searchSimilar(
  embedding: number[],
  opts: {
    clienteId?: string
    leadId?: string
    limit?: number
    minSimilarity?: number
  } = {},
): Promise<SearchResult[]> {
  const db = getPool()
  const vec = `[${embedding.join(',')}]`
  const limit = opts.limit ?? 5
  const minSim = opts.minSimilarity ?? 0.5

  const conditions: string[] = ['1=1']
  const values: unknown[] = [vec, limit]
  let idx = 3

  if (opts.clienteId) {
    conditions.push(`cliente_id = $${idx++}`)
    values.push(opts.clienteId)
  }
  if (opts.leadId) {
    conditions.push(`lead_id = $${idx++}`)
    values.push(opts.leadId)
  }

  const where = conditions.join(' AND ')

  const { rows } = await db.query<{
    id: string
    tipo: string
    titulo: string | null
    conteudo: string
    similarity: number
    cliente_id: string | null
    lead_id: string | null
    metadata: Record<string, unknown> | null
  }>(
    `SELECT
       id, tipo, titulo, conteudo, cliente_id, lead_id, metadata,
       1 - (embedding <=> $1::vector) AS similarity
     FROM embeddings
     WHERE ${where}
       AND 1 - (embedding <=> $1::vector) >= ${minSim}
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    values,
  )

  return rows.map(r => ({
    id: r.id,
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
}): Promise<void> {
  const db = getPool()
  const conditions: string[] = []
  const values: unknown[] = []
  let idx = 1
  if (opts.clienteId) { conditions.push(`cliente_id = $${idx++}`); values.push(opts.clienteId) }
  if (opts.leadId) { conditions.push(`lead_id = $${idx++}`); values.push(opts.leadId) }
  if (opts.documentoId) { conditions.push(`documento_id = $${idx++}`); values.push(opts.documentoId) }
  if (!conditions.length) return
  await db.query(`DELETE FROM embeddings WHERE ${conditions.join(' AND ')}`, values)
}
