// Voyage AI — parceiro oficial da Anthropic para embeddings com Claude
// Modelo: voyage-3-lite (512 dims) — free: 200M tokens/mês
// Docs: https://docs.voyageai.com/docs/embeddings

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'
const VOYAGE_MODEL = 'voyage-3-lite'

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY
  if (!key) throw new Error('VOYAGE_API_KEY não configurada')

  const res = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Voyage API error ${res.status}: ${err}`)
  }

  const data = await res.json() as {
    data: { embedding: number[]; index: number }[]
  }

  return data.data
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding)
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text])
  return embedding
}
