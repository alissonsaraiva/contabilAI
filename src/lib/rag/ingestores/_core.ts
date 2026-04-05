/**
 * Funções internas compartilhadas entre todos os ingestores RAG.
 * NÃO re-exportar deste arquivo — use os ingestores específicos.
 */

import { createHash } from 'crypto'
import { chunkText, embedTexts, storeEmbeddings, deleteEmbeddings, getContentHash } from '@/lib/rag'
import type { EmbeddingRow } from '@/lib/rag'
import { getAiConfig } from '@/lib/ai/config'

export type EmbedKeys = { openai: string | null; voyage: string | null }

export async function getEmbeddingKeys(): Promise<EmbedKeys> {
  try {
    const cfg = await getAiConfig()
    return { openai: cfg.openaiApiKey, voyage: cfg.voyageApiKey }
  } catch {
    return {
      openai: process.env.OPENAI_API_KEY ?? null,
      voyage: process.env.VOYAGE_API_KEY ?? null,
    }
  }
}

export async function indexar(
  texto: string,
  row: Omit<EmbeddingRow, 'conteudo'>,
  keys: EmbedKeys,
): Promise<void> {
  // Usa chunk size adaptativo por tipo — normativos e docs longos usam chunks maiores
  const chunks = chunkText(texto, row.tipo as string | undefined)
  if (!chunks.length) return

  // Dirty check — se documentoId conhecido, evita re-indexar conteúdo idêntico
  // (economiza chamadas de embedding quando um update não muda os campos indexados)
  const contentHash = createHash('md5').update(texto).digest('hex')
  if (row.documentoId) {
    const storedHash = await getContentHash(row.documentoId)
    if (storedHash === contentHash) return  // conteúdo não mudou — pula

    await deleteEmbeddings({ documentoId: row.documentoId })
  } else if (row.leadId && row.tipo) {
    await deleteEmbeddings({ leadId: row.leadId, tipo: row.tipo })
  } else if (row.clienteId && row.tipo) {
    await deleteEmbeddings({ clienteId: row.clienteId, tipo: row.tipo })
  }

  // Prefixo de título: injeta o título no texto embeddado para que chunks de
  // documentos longos mantenham contexto semântico mesmo sem a primeira página.
  // O conteúdo armazenado permanece limpo (sem prefixo) — só o embedding muda.
  const titulo = (row as { titulo?: string }).titulo
  const chunksParaEmbed = titulo && chunks.length > 1
    ? chunks.map(c => `[${titulo}]\n${c}`)
    : chunks

  const embeddings = await embedTexts(chunksParaEmbed, keys)
  const rows: EmbeddingRow[] = chunks.map((conteudo, i) => ({
    ...row,
    conteudo,
    // Mescla metadados do ingestor (ex: dataReferencia) com os automáticos
    metadata: { ...(row.metadata ?? {}), chunkIndex: i, totalChunks: chunks.length, contentHash },
  }))

  await storeEmbeddings(rows, embeddings)
}
