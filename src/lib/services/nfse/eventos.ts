import * as Sentry from '@sentry/nextjs'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { prisma } from '@/lib/prisma'
import { registrarInteracao } from '@/lib/services/interacoes'
import { logger } from '@/lib/logger'
import { getEscritorioSpedy } from './config'
import { salvarPdfXmlNoR2 } from './backup'
import { entregarNotaCliente } from './entrega'
import { notificarEquipeNfsAutorizada, notificarEquipeNfsRejeitada } from './notificacoes'

// ─── Handlers pós-status ──────────────────────────────────────────────────────

/** Indexa a nota no RAG após autorização ou cancelamento. */
async function indexarNotaFiscalRag(
  nota: {
    id: string
    clienteId: string
    numero?: number | null
    valorTotal: unknown
    descricao: string
    autorizadaEm?: Date | null
    canceladaEm?: Date | null
    status?: string | null
    protocolo?: string | null
    ordemServicoId?: string | null
    issValor?: unknown
    issRetido?: boolean
  },
  clienteNome?: string | null,
): Promise<void> {
  try {
    const { indexar: indexarRag } = await import('@/lib/rag/ingest-nota-fiscal')
    await indexarRag(nota, clienteNome)
  } catch (err) {
    logger.warn('nfse-rag-import-falhou', { notaId: nota.id, err })
    Sentry.captureException(err, {
      tags:  { module: 'nfse-service', operation: 'rag-indexar' },
      extra: { notaId: nota.id },
    })
  }
}

export async function onNotaAutorizada(nota: {
  id: string
  clienteId: string
  empresaId?: string | null
  ordemServicoId?: string | null
  numero?: number | null
  valorTotal: unknown
  descricao: string
  tomadorNome?: string | null
  autorizadaEm?: Date | null
  protocolo?: string | null
  spedyId?: string | null
  issValor?: unknown
  issRetido?: boolean
}): Promise<void> {
  const [cliente, config] = await Promise.all([
    prisma.cliente.findUnique({ where: { id: nota.clienteId }, select: { nome: true, cidade: true, uf: true } }),
    getEscritorioSpedy(),
  ])

  const dataAutorizacao  = nota.autorizadaEm ?? new Date()
  const mesAno           = format(dataAutorizacao, 'MMMM/yyyy', { locale: ptBR })
  const numeroFormatado  = nota.numero ? `nº ${nota.numero}` : '(aguardando numeração)'
  const tomadorParte     = nota.tomadorNome ? ` para ${nota.tomadorNome}` : ''

  // 1. Registra interação no histórico do cliente
  await registrarInteracao({
    clienteId: nota.clienteId,
    tipo:      'nota_fiscal_emitida',
    origem:    'sistema',
    titulo:    `NFS-e ${numeroFormatado} autorizada${tomadorParte}`,
    conteudo:  `NFS-e ${numeroFormatado}${tomadorParte} autorizada. Serviço: ${nota.descricao}. Valor: R$ ${Number(nota.valorTotal).toFixed(2)}. Competência: ${mesAno}. Protocolo: ${nota.protocolo ?? 'N/A'}.`,
    metadados: { notaFiscalId: nota.id, numero: nota.numero, protocolo: nota.protocolo },
    escritorioEvento: true,
  }).catch(err => logger.warn('nfse-registrar-interacao-falhou', { notaId: nota.id, err }))

  // 2. Salva cópia local de PDF+XML no R2 (resiliência — Spedy pode ficar indisponível)
  if (nota.spedyId) {
    await salvarPdfXmlNoR2({ id: nota.id, clienteId: nota.clienteId, spedyId: nota.spedyId }).catch(err => {
      logger.warn('nfse-r2-backup-falhou', { notaId: nota.id, err })
      Sentry.captureException(err, {
        tags:  { module: 'nfse-service', operation: 'r2-backup' },
        extra: { notaId: nota.id },
      })
    })
  }

  // 3. Indexa no RAG
  await indexarNotaFiscalRag(nota, cliente?.nome).catch(err =>
    logger.warn('nfse-rag-falhou', { notaId: nota.id, err })
  )

  // 4. Notifica equipe no CRM
  await notificarEquipeNfsAutorizada(nota, cliente?.nome, mesAno).catch(err =>
    logger.warn('nfse-notificar-equipe-falhou', { notaId: nota.id, err })
  )

  // 5. Envia ao cliente se configurado
  if (config.spedyEnviarAoAutorizar) {
    const canal = (config.spedyEnviarCanalPadrao ?? 'whatsapp') as 'whatsapp' | 'email' | 'portal'
    await entregarNotaCliente(nota.id, canal).catch(err =>
      logger.warn('nfse-entrega-cliente-falhou', { notaId: nota.id, canal, err })
    )
  }
}

export async function onNotaRejeitada(nota: {
  id: string
  clienteId: string
  erroCodigo?: string | null
  erroMensagem?: string | null
  valorTotal: unknown
}): Promise<void> {
  const cliente = await prisma.cliente.findUnique({
    where:  { id: nota.clienteId },
    select: { nome: true },
  })

  await notificarEquipeNfsRejeitada(nota, cliente?.nome).catch(err =>
    logger.warn('nfse-notificar-rejeicao-falhou', { notaId: nota.id, err })
  )
}

export async function onNotaCancelada(nota: {
  id: string
  clienteId: string
  numero: number | null
  valorTotal: unknown
  descricao?: string | null
  protocolo?: string | null
  canceladaEm?: Date | null
  cancelamentoJustificativa: string | null
}): Promise<void> {
  const numero = nota.numero ? `nº ${nota.numero}` : `(${nota.id.slice(0, 8)})`

  const [cliente] = await Promise.all([
    prisma.cliente.findUnique({ where: { id: nota.clienteId }, select: { nome: true } }),
  ])

  // 1. Registra interação caso ainda não tenha sido registrada (cancelamento via webhook externo)
  await registrarInteracao({
    clienteId: nota.clienteId,
    tipo:      'nota_fiscal_cancelada',
    origem:    'sistema',
    titulo:    `NFS-e ${numero} cancelada (via Spedy)`,
    conteudo:  `Nota Fiscal cancelada via Spedy. Valor: R$ ${Number(nota.valorTotal).toFixed(2)}. ${nota.cancelamentoJustificativa ? `Justificativa: ${nota.cancelamentoJustificativa}` : ''}`.trim(),
    metadados: { notaFiscalId: nota.id },
    escritorioEvento: true,
  }).catch(err => logger.warn('nfse-webhook-cancelamento-interacao-falhou', { notaId: nota.id, err }))

  // 2. Re-indexa no RAG com status atualizado para "cancelada"
  //    Garante que as IAs (Clara, CRM, WhatsApp) saibam que a nota foi cancelada
  if (nota.descricao) {
    await indexarNotaFiscalRag({
      id:          nota.id,
      clienteId:   nota.clienteId,
      numero:      nota.numero,
      valorTotal:  nota.valorTotal,
      descricao:   nota.descricao,
      status:      'cancelada',
      canceladaEm: nota.canceladaEm ?? new Date(),
      protocolo:   nota.protocolo ?? null,
    }, cliente?.nome).catch(err =>
      logger.warn('nfse-cancelamento-rag-falhou', { notaId: nota.id, err })
    )
  }
}
