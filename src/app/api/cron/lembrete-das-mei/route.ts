/**
 * POST /api/cron/lembrete-das-mei
 *
 * Cron diário que envia lembrete de vencimento da DAS MEI para os clientes
 * cujo vencimento é hoje e a DAS ainda não foi paga.
 *
 * Setup crontab (VPS — usuário: deploy):
 * 0 9 * * * curl -s -X POST https://dominio/api/cron/lembrete-das-mei -H "Authorization: Bearer $CRON_SECRET"
 */
// CRON: 0 9 * * * curl -s -X POST https://dominio/api/cron/lembrete-das-mei -H "Authorization: Bearer $CRON_SECRET"

import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notificarDASVencimento, getEscritorioConfig } from '@/lib/services/das-mei'
import { hc } from '@/lib/healthchecks'

export const maxDuration = 120

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  void hc.start(process.env.HC_LEMBRETE_DAS_MEI)

  // Só executa se Integra Contador estiver habilitado
  const cfgRow = await prisma.escritorio.findFirst({
    select: { integraContadorEnabled: true },
  })
  if (!cfgRow?.integraContadorEnabled) {
    void hc.ok(process.env.HC_LEMBRETE_DAS_MEI)
    return NextResponse.json({ ok: true, msg: 'Integra Contador desabilitado — nada a fazer' })
  }

  const agora    = new Date()
  const inicioDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0)
  const fimDia    = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59)

  let enviados = 0
  let erros    = 0

  try {
    // DAS pendentes com vencimento hoje e ainda não notificadas
    const dasHoje = await prisma.dasMEI.findMany({
      where: {
        status:            'pendente',
        dataVencimento:    { gte: inicioDia, lte: fimDia },
        lembreteEnviadoEm: null,  // evita lembrete duplicado se o cron rodar mais de uma vez no dia
      },
      include: {
        cliente: { select: { id: true, nome: true, email: true, whatsapp: true } },
      },
    })

    const cfg = await getEscritorioConfig()

    for (const das of dasHoje) {
      try {
        await notificarDASVencimento(das as any, das.cliente, cfg)

        await prisma.dasMEI.update({
          where: { id: das.id },
          data:  { lembreteEnviadoEm: new Date() },
        })
        enviados++
      } catch (err) {
        erros++
        Sentry.captureException(err, {
          tags:  { module: 'cron-lembrete-das-mei', operation: 'notificar' },
          extra: { dasId: das.id, clienteId: das.clienteId },
        })
      }
    }

    void hc.ok(process.env.HC_LEMBRETE_DAS_MEI)
    return NextResponse.json({ ok: true, enviados, erros })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    Sentry.captureException(err, {
      tags: { module: 'cron-lembrete-das-mei', operation: 'batch' },
    })
    void hc.fail(process.env.HC_LEMBRETE_DAS_MEI)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
