/**
 * Indexação de Notas Fiscais no RAG
 * Tipo: nota_fiscal | escopo: cliente | canal: crm + portal + whatsapp
 *
 * Permite que as IAs respondam:
 *   - "qual minha última nota fiscal?"
 *   - "foi emitida NF em janeiro?"
 *   - "qual o protocolo da nota de fevereiro?"
 */

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { chunkText, embedTexts, storeEmbeddings, deleteEmbeddings, getContentHash } from '@/lib/rag'
import type { EmbeddingRow } from '@/lib/rag'
import { getAiConfig } from '@/lib/ai/config'
import { logger } from '@/lib/logger'

type EmbedKeys = { openai: string | null; voyage: string | null }

async function getEmbeddingKeys(): Promise<EmbedKeys> {
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

type NotaFiscalData = {
  id: string
  clienteId: string
  numero?: number | null
  valorTotal: unknown
  descricao: string
  tomadorNome?: string | null
  autorizadaEm?: Date | null
  canceladaEm?: Date | null
  status?: string | null
  protocolo?: string | null
  ordemServicoId?: string | null
  issValor?: unknown
  issRetido?: boolean
}

export async function indexar(nota: NotaFiscalData, clienteNome?: string | null): Promise<void> {
  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const dataAuth = nota.autorizadaEm ?? new Date()
  const dataFormatada = format(dataAuth, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  const mesAno = format(dataAuth, 'MMMM/yyyy', { locale: ptBR })
  const numero = nota.numero ? `nº ${nota.numero}` : '(sem número)'
  const valor  = `R$ ${Number(nota.valorTotal).toFixed(2).replace('.', ',')}`
  const iss    = nota.issRetido
    ? `ISS retido: R$ ${Number(nota.issValor ?? 0).toFixed(2).replace('.', ',')}`
    : 'ISS não retido'

  const statusLabel = nota.status === 'cancelada' ? 'Cancelada'
    : nota.status === 'rejeitada'   ? 'Rejeitada'
    : nota.status === 'erro_interno' ? 'Erro interno'
    : 'Autorizada'

  const canceladaFmt = nota.canceladaEm
    ? format(nota.canceladaEm, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    : null

  const texto = [
    `Nota Fiscal de Serviço (NFS-e) ${numero}`,
    `Status: ${statusLabel}`,
    `Prestador (cliente): ${clienteNome ?? nota.clienteId}`,
    nota.tomadorNome ? `Tomador (destinatário da nota): ${nota.tomadorNome}` : '',
    `Data de autorização: ${dataFormatada}`,
    canceladaFmt ? `Data de cancelamento: ${canceladaFmt}` : '',
    `Competência: ${mesAno}`,
    `Valor total: ${valor}`,
    iss,
    `Descrição do serviço: ${nota.descricao}`,
    nota.protocolo ? `Protocolo: ${nota.protocolo}` : '',
    nota.ordemServicoId ? `Ref. Chamado: ${nota.ordemServicoId}` : '',
  ].filter(Boolean).join('\n')

  const documentoId = `nota_fiscal:${nota.id}`
  const chunks = chunkText(texto, 'nota_fiscal')
  if (!chunks.length) return

  // Dirty check — evita re-embedding quando o conteúdo não mudou (ex: webhook duplicado)
  const { createHash } = await import('crypto')
  const contentHash = createHash('md5').update(texto).digest('hex')
  try {
    const storedHash = await getContentHash(documentoId)
    if (storedHash === contentHash) {
      logger.info('nfse-rag-sem-mudanca', { notaId: nota.id })
      return
    }
    await deleteEmbeddings({ documentoId })
  } catch (err) {
    logger.warn('nfse-rag-delete-falhou', { notaId: nota.id, err })
  }

  const embeddings = await embedTexts(chunks, keys)
  const rows: EmbeddingRow[] = chunks.map((conteudo, i) => ({
    escopo:      'cliente' as const,
    tipo:        'nota_fiscal' as const,
    clienteId:   nota.clienteId,
    titulo:      `NFS-e ${numero} — ${mesAno}`,
    documentoId,
    canal:       'geral' as const,  // visível para CRM, portal e WhatsApp
    conteudo,
    metadata:    { chunkIndex: i, totalChunks: chunks.length, contentHash, dataReferencia: dataAuth.toISOString().slice(0, 10) },
  }))

  await storeEmbeddings(rows, embeddings)
  logger.info('nfse-rag-indexado', { notaId: nota.id, chunks: chunks.length })
}
