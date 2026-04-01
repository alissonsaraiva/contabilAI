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
import { chunkText, embedTexts, storeEmbeddings, deleteEmbeddings } from '@/lib/rag'
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

  const texto = [
    `Nota Fiscal de Serviço (NFS-e) ${numero}`,
    `Prestador (cliente): ${clienteNome ?? nota.clienteId}`,
    nota.tomadorNome ? `Tomador (destinatário da nota): ${nota.tomadorNome}` : '',
    `Data de autorização: ${dataFormatada}`,
    `Competência: ${mesAno}`,
    `Valor total: ${valor}`,
    iss,
    `Descrição do serviço: ${nota.descricao}`,
    nota.protocolo ? `Protocolo: ${nota.protocolo}` : '',
    nota.ordemServicoId ? `Ref. OS: ${nota.ordemServicoId}` : '',
  ].filter(Boolean).join('\n')

  const documentoId = `nota_fiscal:${nota.id}`
  const chunks = chunkText(texto)
  if (!chunks.length) return

  // Deleta apenas os chunks DESTA nota (por documentoId), não de todas as notas do cliente
  try {
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
    metadata:    { chunkIndex: i, totalChunks: chunks.length },
  }))

  await storeEmbeddings(rows, embeddings)
  logger.info('nfse-rag-indexado', { notaId: nota.id, chunks: chunks.length })
}
