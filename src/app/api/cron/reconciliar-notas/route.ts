/**
 * POST /api/cron/reconciliar-notas
 *
 * Cron de reconciliação de NFS-e presas em "enviando" ou "processando".
 * Notas nesses estados por mais de 10 minutos provavelmente não receberam
 * o webhook da Spedy (falha de entrega, reinicialização do servidor, etc.).
 *
 * Para cada nota presa:
 *   1. Consulta o status atual na Spedy pelo spedyId
 *   2. Atualiza o status local e dispara as ações pós-status
 *   3. Se a Spedy retornar erro ou a nota não for encontrada, marca como erro_interno
 *      e abre OS de escalonamento
 *
 * Setup crontab (VPS) — a cada 5 minutos (linha fora do bloco de comentário):
 */
// CRON: */5 * * * * curl -s -X POST https://dominio/api/cron/reconciliar-notas -H "Authorization: Bearer $CRON_SECRET"

import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSpedyClienteClient } from '@/lib/spedy'
import { logger } from '@/lib/logger'
import { processarWebhookSpedy } from '@/lib/services/notas-fiscais'
import type { SpedyWebhookPayload } from '@/lib/spedy'

export const maxDuration = 55

const MINUTOS_PRESA = 10         // nota presa se neste status por mais de X min
const MAX_BATCH     = 50         // máximo de notas por execução

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const limite = new Date(Date.now() - MINUTOS_PRESA * 60 * 1000)

  let reconciliadas = 0
  let erros         = 0

  try {
    const notasPresas = await prisma.notaFiscal.findMany({
      where: {
        status:      { in: ['enviando', 'processando'] },
        atualizadoEm: { lt: limite },
        spedyId:     { not: null },
      },
      include: {
        empresa: { select: { spedyApiKey: true } },
      },
      take: MAX_BATCH,
      orderBy: { atualizadoEm: 'asc' },
    })

    if (notasPresas.length === 0) {
      return NextResponse.json({ reconciliadas: 0, erros: 0, mensagem: 'Nenhuma nota presa encontrada.' })
    }

    logger.info('cron-reconciliar-notas-iniciado', { quantidade: notasPresas.length })

    const config = await prisma.escritorio.findFirst({
      select: { spedyApiKey: true, spedyAmbiente: true },
    })

    for (const nota of notasPresas) {
      try {
        const spedyApiKey = nota.empresa?.spedyApiKey
        if (!spedyApiKey || !nota.spedyId) {
          logger.warn('cron-reconciliar-nota-sem-key', { notaId: nota.id })
          continue
        }

        const spedyClient = getSpedyClienteClient({
          spedyApiKey,
          spedyAmbiente: config?.spedyAmbiente ?? 'sandbox',
        })

        // Consulta o status atual na Spedy
        let spedyNota: Awaited<ReturnType<typeof spedyClient.consultarNfse>>
        try {
          spedyNota = await spedyClient.consultarNfse(nota.spedyId)
        } catch (consultaErr) {
          logger.warn('cron-reconciliar-consulta-falhou', { notaId: nota.id, spedyId: nota.spedyId, err: consultaErr })
          // Marca como erro_interno se não conseguir consultar na Spedy
          await prisma.notaFiscal.update({
            where: { id: nota.id },
            data: {
              status:       'erro_interno',
              erroMensagem: 'Reconciliação: não foi possível consultar status na Spedy',
              tentativas:   (nota.tentativas ?? 0) + 1,
              atualizadoEm: new Date(),
            },
          })
          await abrirOsReconciliacao(nota.id, nota.clienteId, 'Erro ao consultar NFS-e na Spedy durante reconciliação')
          erros++
          continue
        }

        // Monta um payload sintético igual ao que viria pelo webhook
        const payloadSintetico: SpedyWebhookPayload = {
          id:    `reconciliacao-${nota.id}-${Date.now()}`,
          event: spedyNota.status === 'authorized' ? 'invoice.authorized'
                : spedyNota.status === 'rejected'  ? 'invoice.rejected'
                : spedyNota.status === 'canceled'  ? 'invoice.canceled'
                : 'invoice.status_changed',
          data: spedyNota,
        }

        await processarWebhookSpedy(payloadSintetico)
        reconciliadas++

        logger.info('cron-reconciliar-nota-atualizada', {
          notaId:      nota.id,
          spedyId:     nota.spedyId,
          novoStatus:  spedyNota.status,
        })

      } catch (err) {
        erros++
        logger.error('cron-reconciliar-nota-erro', { notaId: nota.id, err })
        Sentry.captureException(err, {
          tags:  { module: 'cron-reconciliar-notas', operation: 'processar-nota' },
          extra: { notaId: nota.id, spedyId: nota.spedyId },
        })
      }
    }

    logger.info('cron-reconciliar-notas-concluido', { reconciliadas, erros })
    return NextResponse.json({ reconciliadas, erros })

  } catch (err) {
    logger.error('cron-reconciliar-notas-falhou', { err })
    Sentry.captureException(err, { tags: { module: 'cron-reconciliar-notas', operation: 'main' } })
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

async function abrirOsReconciliacao(notaId: string, clienteId: string, motivo: string): Promise<void> {
  try {
    const cliente = await prisma.cliente.findUnique({
      where:  { id: clienteId },
      select: { empresaId: true },
    })
    await prisma.ordemServico.create({
      data: {
        clienteId,
        empresaId:    cliente?.empresaId ?? undefined,
        tipo:         'emissao_documento',
        origem:       'operador',
        visivelPortal: false,
        titulo:       `NFS-e presa — verificar status (ID: ${notaId.slice(0, 8)})`,
        descricao:    `${motivo}\n\nID interno: ${notaId}\nAção necessária: verificar o status desta nota na Spedy e atualizar manualmente se necessário.`,
        prioridade:   'alta',
        status:       'aberta',
      },
    })
  } catch (osErr) {
    logger.error('cron-reconciliar-os-falhou', { notaId, osErr })
    Sentry.captureException(osErr, {
      tags:  { module: 'cron-reconciliar-notas', operation: 'abrir-os' },
      extra: { notaId },
    })
  }
}
