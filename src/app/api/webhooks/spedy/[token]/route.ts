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

  // 3. Responde 200 imediatamente — processamento em background
  // (Spedy exige resposta rápida para não marcar webhook como falho)
  const processamento = processarWebhookSpedy(payload).catch(err => {
    logger.error('spedy-webhook-processamento-falhou', {
      event:   payload.event,
      spedyId: payload.data?.id,
      err,
    })
    Sentry.captureException(err, { tags: { module: 'webhook-spedy', event: payload.event }, extra: { spedyId: payload.data?.id } })
  })

  // Aguarda apenas 1s para dar chance ao processamento sem bloquear
  await Promise.race([
    processamento,
    new Promise(resolve => setTimeout(resolve, 1000)),
  ])

  return NextResponse.json({ received: true })
}
