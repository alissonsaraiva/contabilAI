// Embedding providers — OpenAI primary (text-embedding-3-small), Voyage fallback
//
// Ambos produzem vetores de 512 dimensões:
// - OpenAI text-embedding-3-small suporta MRL (Matryoshka Representation Learning),
//   o que permite reduzir para 512 dims sem perda significativa de qualidade.
// - Voyage voyage-3-lite produz 512 dims nativamente.
//
// Manter a mesma dimensão garante compatibilidade com o banco (vector(512))
// e permite que Voyage seja um fallback real para query e ingest.
//
// IMPORTANTE: ao trocar de modelo (Voyage → OpenAI), os vetores existentes ficam
// desatualizados (espaços vetoriais diferentes). Re-indexar o conteúdo existente
// via CRM → Configurações → IA → Base de Conhecimento.

const OPENAI_EMBED_URL   = 'https://api.openai.com/v1/embeddings'
const OPENAI_EMBED_MODEL = 'text-embedding-3-small'
const OPENAI_EMBED_DIMS  = 512  // MRL — mantém compatibilidade com vector(512) no pgvector

const VOYAGE_API_URL  = 'https://api.voyageai.com/v1/embeddings'
const VOYAGE_MODEL    = 'voyage-3-lite'

export type EmbedKeys = {
  openai?: string | null
  voyage?: string | null
}

async function embedViaOpenAI(texts: string[], apiKey: string): Promise<number[][]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  let res: Response
  try {
    res = await fetch(OPENAI_EMBED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input: texts, model: OPENAI_EMBED_MODEL, dimensions: OPENAI_EMBED_DIMS }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI Embeddings ${res.status}: ${err}`)
  }
  const data = await res.json() as { data: { embedding: number[]; index: number }[] }
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding)
}

async function embedViaVoyage(texts: string[], apiKey: string): Promise<number[][]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)
  let res: Response
  try {
    res = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input: texts, model: VOYAGE_MODEL }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Voyage API ${res.status}: ${err}`)
  }
  const data = await res.json() as { data: { embedding: number[]; index: number }[] }
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding)
}

/**
 * Gera embeddings para uma lista de textos.
 * Tenta OpenAI primeiro; se falhar, tenta Voyage como fallback.
 * As chaves são opcionais — se omitidas, lê das variáveis de ambiente.
 */
export async function embedTexts(texts: string[], keys?: EmbedKeys): Promise<number[][]> {
  const openaiKey = keys?.openai ?? process.env.OPENAI_API_KEY ?? null
  const voyageKey = keys?.voyage ?? process.env.VOYAGE_API_KEY ?? null

  if (openaiKey) {
    try {
      return await embedViaOpenAI(texts, openaiKey)
    } catch (err) {
      console.warn('[embeddings] OpenAI falhou, usando Voyage como fallback:', (err as Error).message)
      if (!voyageKey) throw err
    }
  }

  if (voyageKey) {
    return await embedViaVoyage(texts, voyageKey)
  }

  throw new Error('Nenhuma chave de embedding configurada (OPENAI_API_KEY ou VOYAGE_API_KEY)')
}

export async function embedText(text: string, keys?: EmbedKeys): Promise<number[]> {
  const [embedding] = await embedTexts([text], keys)
  return embedding
}
