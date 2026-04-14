/**
 * POST /api/crm/listas-transmissao/processar-envios
 *
 * Cron endpoint para processar envios de broadcast pendentes.
 * Chamado a cada ~15s pelo cron da VPS.
 *
 * Setup crontab (VPS):
 *   * * * * * for i in 0 15 30 45; do sleep $i; \
 *     curl -s -X POST https://dominio/api/crm/listas-transmissao/processar-envios \
 *     -H "Authorization: Bearer $CRON_SECRET" > /dev/null 2>&1; done
 */

import { NextResponse } from 'next/server'
import { processarEnviosPendentes } from '@/lib/broadcast/processar-envios'
import { hc } from '@/lib/healthchecks'
import * as Sentry from '@sentry/nextjs'

export const maxDuration = 55

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const authorization = req.headers.get('authorization') ?? ''
    if (authorization !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await processarEnviosPendentes()
    void hc.ok(process.env.HC_PROCESSAR_ENVIOS_BROADCAST)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[processar-envios-broadcast] erro geral:', msg)
    void hc.fail(process.env.HC_PROCESSAR_ENVIOS_BROADCAST)
    Sentry.captureException(err, { tags: { module: 'cron-broadcast' } })
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 })
  }
}
