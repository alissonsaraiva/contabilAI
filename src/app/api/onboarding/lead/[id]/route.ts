/**
 * Endpoint público para leitura de dados do lead durante o fluxo de onboarding.
 * Não requer autenticação — acessível pelas páginas públicas do wizard.
 * Expõe apenas campos necessários para o frontend (sem dados financeiros ou internos).
 */
import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { rateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params) {
  // Rate limit: 60 leituras por IP por hora (tolerante a recarregamentos)
  const ip = getClientIp(req)
  const rl = rateLimit(`onboarding:lead:${ip}`, 60, 60 * 60_000)
  if (!rl.allowed) return tooManyRequests(rl.retryAfterMs)

  const { id } = await params

  try {
    const lead = await prisma.lead.findUnique({
      where: { id },
      select: {
        id: true,
        contatoEntrada: true,
        canal: true,
        planoTipo: true,
        vencimentoDia: true,
        formaPagamento: true,
        status: true,
        stepAtual: true,
        dadosJson: true,
        contrato: {
          select: {
            status: true,
            pdfUrl: true,
          },
        },
      },
    })

    if (!lead) {
      return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
    }

    // Bloqueia leitura de leads expirados ou cancelados para evitar acesso a dados obsoletos
    if (lead.status === 'expirado' || lead.status === 'cancelado') {
      return NextResponse.json({ error: 'Link expirado ou inválido' }, { status: 410 })
    }

    return NextResponse.json(lead)
  } catch (err) {
    console.error('[onboarding/lead] Erro ao buscar lead:', { id, err })
    Sentry.captureException(err, {
      tags: { module: 'onboarding-lead', operation: 'get-lead' },
      extra: { leadId: id },
    })
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
