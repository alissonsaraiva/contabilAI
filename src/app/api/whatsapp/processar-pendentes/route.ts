/**
 * POST /api/whatsapp/processar-pendentes
 *
 * Endpoint de cron para debounce de mensagens WhatsApp.
 * Chamado a cada 4-5 segundos pelo cron da VPS.
 *
 * Setup crontab (VPS):
 *   * * * * * for i in 0 12 24 36 48; do sleep $i; \
 *     curl -s -X POST https://dominio/api/whatsapp/processar-pendentes \
 *     -H "Authorization: Bearer $CRON_SECRET" > /dev/null 2>&1; done
 *
 * Isso dispara 5x por minuto (a cada 12s). Para 4s de debounce é suficiente.
 */

import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { processarMensagensPendentes } from '@/lib/whatsapp/processar-pendentes'
import { hc } from '@/lib/healthchecks'
import '@/lib/ai/tools'

export const maxDuration = 55

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  void hc.start(process.env.HC_PROCESSAR_PENDENTES)
  try {
    const result = await processarMensagensPendentes()
    void hc.ok(process.env.HC_PROCESSAR_PENDENTES)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[processar-pendentes] erro geral:', msg)
    void hc.fail(process.env.HC_PROCESSAR_PENDENTES)
    Sentry.captureException(err, { tags: { module: 'cron-processar-pendentes' } })
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 })
  }
}
