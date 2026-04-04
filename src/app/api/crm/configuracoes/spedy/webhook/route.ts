/**
 * GET  /api/crm/configuracoes/spedy/webhook — status do webhook registrado na Spedy
 * POST /api/crm/configuracoes/spedy/webhook — registra (ou re-registra) o webhook na Spedy
 *
 * Necessário para que a Spedy envie notificações de status de NFS-e em tempo real.
 * Sem webhook registrado, o sistema depende exclusivamente do cron de reconciliação.
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getSpedyOwnerClient } from '@/lib/spedy'
import { montarWebhookUrl } from '@/lib/services/notas-fiscais'
import { logger } from '@/lib/logger'

async function getConfig() {
  const escritorio = await prisma.escritorio.findFirst({
    select: { spedyApiKey: true, spedyAmbiente: true },
  })
  return escritorio
}

export async function GET(_req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const escritorio = await getConfig()
  if (!escritorio?.spedyApiKey) {
    return NextResponse.json({ configurado: false, motivo: 'Conta Owner Spedy não configurada' })
  }

  const webhookUrl = montarWebhookUrl(escritorio.spedyApiKey)

  try {
    const client   = getSpedyOwnerClient({ spedyApiKey: escritorio.spedyApiKey, spedyAmbiente: escritorio.spedyAmbiente })
    const { items } = await client.listarWebhooks()

    const nosso = items.find(w => w.url === webhookUrl)

    return NextResponse.json({
      configurado:    !!nosso,
      ativo:          nosso?.enabled ?? false,
      webhookId:      nosso?.id      ?? null,
      webhookUrl,
      totalRegistrados: items.length,
    })
  } catch (err) {
    logger.error('api-spedy-webhook-status', { err })
    Sentry.captureException(err, { tags: { module: 'crm-configuracoes-spedy', operation: 'webhook-status' } })
    const msg = err instanceof Error ? err.message : 'Erro ao consultar webhooks na Spedy'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

export async function POST(_req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const escritorio = await getConfig()
  if (!escritorio?.spedyApiKey) {
    return NextResponse.json({ error: 'Conta Owner Spedy não configurada' }, { status: 422 })
  }

  const webhookUrl = montarWebhookUrl(escritorio.spedyApiKey)

  try {
    const client     = getSpedyOwnerClient({ spedyApiKey: escritorio.spedyApiKey, spedyAmbiente: escritorio.spedyAmbiente })
    const { items }  = await client.listarWebhooks()

    // Já existe e está ativo — nada a fazer
    const existente = items.find(w => w.url === webhookUrl)
    if (existente?.enabled) {
      return NextResponse.json({ sucesso: true, acao: 'ja_registrado', webhookId: existente.id, webhookUrl })
    }

    // Existe mas desativado — reativar
    if (existente && !existente.enabled) {
      await client.reativarWebhook(existente.id)
      logger.info('spedy-webhook-reativado', { webhookId: existente.id })
      return NextResponse.json({ sucesso: true, acao: 'reativado', webhookId: existente.id, webhookUrl })
    }

    // Não existe — registrar
    const novo = await client.criarWebhook(webhookUrl)
    logger.info('spedy-webhook-registrado', { webhookId: novo.id, webhookUrl })
    return NextResponse.json({ sucesso: true, acao: 'registrado', webhookId: novo.id, webhookUrl })

  } catch (err) {
    logger.error('api-spedy-webhook-registrar', { err })
    Sentry.captureException(err, { tags: { module: 'crm-configuracoes-spedy', operation: 'webhook-registrar' } })
    const msg = err instanceof Error ? err.message : 'Erro ao registrar webhook na Spedy'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
