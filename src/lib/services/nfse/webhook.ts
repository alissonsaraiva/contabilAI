import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import type { SpedyWebhookPayload } from '@/lib/spedy'
import { logger } from '@/lib/logger'
import type { StatusNotaFiscal } from '@prisma/client'
import { onNotaAutorizada, onNotaRejeitada, onNotaCancelada } from './eventos'

// ─── Processamento de Webhook ─────────────────────────────────────────────────

export async function processarWebhookSpedy(payload: SpedyWebhookPayload): Promise<void> {
  const { event, data } = payload

  if (!data?.id) {
    logger.warn('spedy-webhook-sem-id', { event })
    return
  }

  const nota = await prisma.notaFiscal.findUnique({
    where: { spedyId: data.id },
  })
  // Guarda status anterior para evitar disparar handlers duplicados
  const statusAnterior = nota?.status

  if (!nota) {
    // Pode ser de uma nota criada no backoffice diretamente — ignorar
    logger.info('spedy-webhook-nota-nao-encontrada', { spedyId: data.id, event })
    return
  }

  const statusMapeado: StatusNotaFiscal =
    data.status === 'authorized' ? 'autorizada'
    : data.status === 'rejected' ? 'rejeitada'
    : data.status === 'canceled' ? 'cancelada'
    : 'processando'

  const updateData: Record<string, unknown> = {
    status:      statusMapeado,
    atualizadoEm: new Date(),
  }

  if (data.status === 'authorized') {
    updateData.numero       = data.number ?? null
    updateData.protocolo    = data.authorization?.protocol ?? null
    updateData.autorizadaEm = data.authorization?.date ? new Date(data.authorization.date) : new Date()
    updateData.erroCodigo   = null
    updateData.erroMensagem = null
    updateData.pdfUrl       = null  // será construído via proxy com o spedyId
    updateData.xmlUrl       = null
  }

  if (data.status === 'rejected') {
    updateData.erroCodigo   = data.processingDetail?.code    ?? null
    updateData.erroMensagem = data.processingDetail?.message ?? 'Nota rejeitada'
    const tentativas        = (nota.tentativas ?? 0) + 1
    updateData.tentativas   = tentativas
  }

  if (data.status === 'canceled') {
    updateData.canceladaEm = new Date()
  }

  const notaAtualizada = await prisma.notaFiscal.update({
    where: { id: nota.id },
    data:  updateData as never,
  })

  // Ações pós-status — só dispara se houve MUDANÇA real de status
  // Evita handlers duplicados quando webhook chega após ação local (ex: cancelamento via CRM)
  // ou quando o cron de reconciliação processa a mesma nota em paralelo

  if (statusMapeado === 'autorizada' && statusAnterior !== 'autorizada') {
    await onNotaAutorizada(notaAtualizada).catch(err => {
      logger.error('spedy-pos-autorizacao-falhou', { notaId: nota.id, err })
      Sentry.captureException(err, {
        tags:  { module: 'nfse-service', operation: 'pos-autorizacao' },
        extra: { notaId: nota.id },
      })
    })
  }

  if (statusMapeado === 'rejeitada' && statusAnterior !== 'rejeitada') {
    await onNotaRejeitada(notaAtualizada).catch(err => {
      logger.error('spedy-pos-rejeicao-falhou', { notaId: nota.id, err })
      Sentry.captureException(err, {
        tags:  { module: 'nfse-service', operation: 'pos-rejeicao' },
        extra: { notaId: nota.id },
      })
    })
  }

  if (statusMapeado === 'cancelada' && statusAnterior !== 'cancelada') {
    // Nota já cancelada localmente (via CRM) → interação já foi registrada em cancelamento.ts
    // Só dispara se o cancelamento veio diretamente da Spedy sem passar pelo CRM
    await onNotaCancelada(notaAtualizada).catch(err => {
      logger.error('spedy-pos-cancelamento-falhou', { notaId: nota.id, err })
      Sentry.captureException(err, {
        tags:  { module: 'nfse-service', operation: 'pos-cancelamento' },
        extra: { notaId: nota.id },
      })
    })
  }
}
