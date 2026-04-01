/**
 * POST /api/cron/retry-documentos
 *
 * Cron que re-tenta processar documentos cujo resumo IA falhou.
 * Processa até DOCUMENTO_MAX_TENTATIVAS (3) por documento; após isso o documento
 * fica com resumoStatus='esgotado' e uma OS é aberta (feito em resumirDocumento).
 *
 * Setup crontab (VPS) — a cada hora:
 *   0 * * * * curl -s -X POST https://dominio/api/cron/retry-documentos \
 *     -H "Authorization: Bearer $CRON_SECRET" > /dev/null 2>&1
 */

import * as Sentry from '@sentry/nextjs'
import { NextResponse }               from 'next/server'
import { prisma }                     from '@/lib/prisma'
import { resumirDocumento }           from '@/lib/services/resumir-documento'
import { DOCUMENTO_MAX_TENTATIVAS }   from '@/lib/services/documento-config'

export const maxDuration = 55
const BATCH_SIZE     = 20  // processa no máximo 20 documentos por execução

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  try {
    // Inclui docs presos em 'processando' há mais de 30min (servidor caiu durante o processo)
    const trintaMinAtras = new Date(Date.now() - 30 * 60_000)

    // Busca documentos que falharam e ainda têm tentativas restantes
    const docs = await prisma.documento.findMany({
      where: {
        OR: [
          { resumoStatus: { in: ['falhou', 'pendente'] }, resumoTentativas: { lt: DOCUMENTO_MAX_TENTATIVAS } },
          { resumoStatus: 'processando', criadoEm: { lt: trintaMinAtras } },
        ],
        deletadoEm: null,
        // Só reprocessa se tiver URL (arquivo salvo no S3)
        url:        { not: '' },
      },
      select: { id: true, nome: true, resumoTentativas: true },
      orderBy: { criadoEm: 'asc' },
      take: BATCH_SIZE,
    })

    if (docs.length === 0) {
      return NextResponse.json({ ok: true, processados: 0 })
    }

    let ok = 0
    let falhou = 0
    const erros: string[] = []

    for (const doc of docs) {
      try {
        const resumo = await resumirDocumento(doc.id)
        if (resumo) {
          ok++
        } else {
          falhou++
        }
      } catch (err) {
        falhou++
        const msg = err instanceof Error ? err.message : String(err)
        erros.push(`${doc.id}: ${msg}`)
        console.error('[retry-documentos] erro ao processar:', doc.id, msg)
      }
    }

    return NextResponse.json({ ok: true, processados: docs.length, sucessos: ok, falhou, erros })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[retry-documentos] erro geral:', msg)
    Sentry.captureException(err, { tags: { module: 'cron-retry-documentos' } })
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 })
  }
}
