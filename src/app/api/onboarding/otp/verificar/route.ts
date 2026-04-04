/**
 * POST /api/onboarding/otp/verificar
 *
 * Valida o código OTP informado pelo lead.
 * Marca _otpVerificado=true no dadosJson se correto.
 *
 * Rate limit: 10 tentativas por leadId/hora (anti-brute force).
 */
import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { rateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit'

export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rlIp = rateLimit(`otp:verificar:ip:${ip}`, 20, 60 * 60_000)
  if (!rlIp.allowed) return tooManyRequests(rlIp.retryAfterMs)

  let leadId: string | undefined
  let codigo: string | undefined

  try {
    const body = await req.json() as { leadId?: string; codigo?: string }
    leadId = body.leadId
    codigo = body.codigo?.trim()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  if (!leadId || !codigo) {
    return NextResponse.json({ error: 'leadId e codigo são obrigatórios' }, { status: 400 })
  }

  const rlLead = rateLimit(`otp:verificar:lead:${leadId}`, 10, 60 * 60_000)
  if (!rlLead.allowed) return tooManyRequests(rlLead.retryAfterMs)

  try {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { dadosJson: true } })
    if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

    const dados = lead.dadosJson as Record<string, unknown> | null ?? {}
    const otpCodigo    = dados._otpCodigo    as string | undefined
    const otpExpiraEm  = dados._otpExpiraEm  as string | undefined
    const otpVerificado = dados._otpVerificado as boolean | undefined

    if (!otpCodigo || !otpExpiraEm) {
      return NextResponse.json({ error: 'Nenhum código pendente. Solicite um novo código.' }, { status: 400 })
    }

    if (otpVerificado) {
      return NextResponse.json({ ok: true, jaVerificado: true })
    }

    if (new Date() > new Date(otpExpiraEm)) {
      return NextResponse.json({ error: 'Código expirado. Solicite um novo código.' }, { status: 400 })
    }

    if (codigo !== otpCodigo) {
      return NextResponse.json({ error: 'Código incorreto.' }, { status: 400 })
    }

    // Marca como verificado e limpa o código (não precisa mais)
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        dadosJson: {
          ...dados,
          _otpVerificado: true,
          _otpCodigo:   null,
          _otpExpiraEm: null,
        },
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[otp/verificar] Erro interno:', { leadId, err })
    Sentry.captureException(err, {
      tags:  { module: 'onboarding-otp', operation: 'verificar' },
      extra: { leadId },
    })
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
