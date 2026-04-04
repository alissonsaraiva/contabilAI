import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { rateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit'

export async function POST(req: Request) {
  // Rate limit: 120 saves por IP por hora (auto-save a cada 1.5s)
  const ip = getClientIp(req)
  const rl = rateLimit(`onboarding:salvar:${ip}`, 120, 60 * 60_000)
  if (!rl.allowed) return tooManyRequests(rl.retryAfterMs)

  let leadId: string | undefined
  let data: Record<string, unknown>

  try {
    const body = await req.json() as Record<string, unknown>
    leadId = body.leadId as string | undefined
    const { leadId: _leadId, ...rest } = body
    data = rest
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  if (!leadId) {
    return NextResponse.json({ error: 'leadId obrigatório' }, { status: 400 })
  }

  try {
    // Merge dadosJson em vez de substituir — preserva dados de outros passos do wizard
    if (data.dadosJson) {
      const current = await prisma.lead.findUnique({ where: { id: leadId }, select: { dadosJson: true } })
      if (!current) {
        return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
      }
      const currentJson = (current.dadosJson as Record<string, unknown>) ?? {}
      data.dadosJson = { ...currentJson, ...(data.dadosJson as Record<string, unknown>) }
    }

    const lead = await prisma.lead.update({ where: { id: leadId }, data: data as Parameters<typeof prisma.lead.update>[0]['data'] })

    // Indexação assíncrona — não bloqueia resposta
    indexarAsync('lead', lead)

    return NextResponse.json(lead)
  } catch (err) {
    console.error('[onboarding/salvar-progresso] Erro ao salvar progresso:', { leadId, err })
    Sentry.captureException(err, {
      tags: { module: 'onboarding-salvar-progresso', operation: 'update-lead' },
      extra: { leadId },
    })
    return NextResponse.json({ error: 'Erro ao salvar progresso. Tente novamente.' }, { status: 500 })
  }
}
