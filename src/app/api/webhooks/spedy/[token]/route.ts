/**
 * Webhook Spedy — recebe eventos de NFS-e
 *
 * URL: https://seudominio/api/webhooks/spedy/[token]
 * O token é um hash SHA-256 dos primeiros 32 chars da API key do escritório.
 * Gerado por montarWebhookUrl() em src/lib/services/notas-fiscais.ts
 *
 * Eventos tratados:
 *   invoice.status_changed → atualiza status da nota, dispara ações pós-autorização/rejeição
 *   invoice.authorized     → idem
 *   invoice.rejected       → idem
 *   invoice.canceled       → idem
 */

import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { processarWebhookSpedy } from '@/lib/services/notas-fiscais'
import { logger } from '@/lib/logger'
import type { SpedyWebhookPayload } from '@/lib/spedy'

async function verificarToken(token: string): Promise<boolean> {
  try {
    const escritorio = await prisma.escritorio.findFirst({
      select: { spedyApiKey: true },
    })
    if (!escritorio?.spedyApiKey) return false

    const raw = isEncrypted(escritorio.spedyApiKey)
      ? decrypt(escritorio.spedyApiKey)
      : escritorio.spedyApiKey

    const esperado = createHash('sha256').update(raw).digest('hex').slice(0, 32)
    return token === esperado
  } catch (err) {
    logger.error('spedy-webhook-verificar-token', { err })
    return false
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params

  // 1. Verifica token de segurança
  const tokenValido = await verificarToken(token)
  if (!tokenValido) {
    logger.warn('spedy-webhook-token-invalido', { token })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse do payload
  let payload: SpedyWebhookPayload
  try {
    payload = await req.json()
  } catch (err) {
    logger.error('spedy-webhook-parse-error', { err })
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // 3. Idempotência — evita processar o mesmo evento duas vezes
  //    A Spedy pode reenviar eventos em caso de falha de entrega.
  //    WebhookLog tem unique([provider, eventId]) — a criação falha com P2002 se já existir.
  try {
    await prisma.webhookLog.create({
      data: {
        provider: 'spedy',
        eventId:  payload.id,
        payload:  payload as object,
      },
    })
  } catch (err: unknown) {
    const isPrismaUniqueViolation =
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'

    if (isPrismaUniqueViolation) {
      logger.warn('spedy-webhook-evento-duplicado', {
        eventId: payload.id,
        event:   payload.event,
        spedyId: payload.data?.id,
      })
      return NextResponse.json({ received: true, duplicate: true })
    }

    // Erro inesperado ao registrar — loga mas processa assim mesmo para não perder o evento
    logger.error('spedy-webhook-log-error', { err, eventId: payload.id })
    Sentry.captureException(err, {
      tags:  { module: 'webhook-spedy', operation: 'criar-log-idempotencia' },
      extra: { eventId: payload.id, event: payload.event },
    })
  }

  // 4. Responde 200 imediatamente — processamento em background
  //    (Spedy exige resposta rápida para não marcar webhook como falho)
  const processamento = processarWebhookSpedy(payload)
    .then(async () => {
      // Marca como processado com sucesso no log
      await prisma.webhookLog.updateMany({
        where: { provider: 'spedy', eventId: payload.id },
        data:  { processado: true },
      })
    })
    .catch(err => {
      logger.error('spedy-webhook-processamento-falhou', {
        event:   payload.event,
        spedyId: payload.data?.id,
        err,
      })
      Sentry.captureException(err, {
        tags:  { module: 'webhook-spedy', event: payload.event },
        extra: { spedyId: payload.data?.id, eventId: payload.id },
      })
    })

  // Aguarda apenas 1s para dar chance ao processamento sem bloquear
  await Promise.race([
    processamento,
    new Promise(resolve => setTimeout(resolve, 1000)),
  ])

  return NextResponse.json({ received: true })
}
