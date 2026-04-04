/**
 * POST /api/onboarding/otp/enviar
 *
 * Gera um código OTP de 6 dígitos, armazena no lead.dadosJson e envia por e-mail.
 * Chamado antes da etapa de revisão para garantir que o lead tem acesso real ao e-mail.
 *
 * Rate limit: 5 envios por IP/hora + 3 envios por leadId/hora.
 */
import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { rateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit'
import { sendEmail } from '@/lib/email/send'
import { getEscritorioConfig } from '@/lib/escritorio'

const OTP_EXPIRY_MS = 10 * 60 * 1000 // 10 minutos

function gerarOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rlIp = rateLimit(`otp:enviar:ip:${ip}`, 5, 60 * 60_000)
  if (!rlIp.allowed) return tooManyRequests(rlIp.retryAfterMs)

  let leadId: string | undefined
  let email: string | undefined

  try {
    const body = await req.json() as { leadId?: string; email?: string }
    leadId = body.leadId
    email  = body.email?.trim().toLowerCase()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  if (!leadId || !email) {
    return NextResponse.json({ error: 'leadId e email são obrigatórios' }, { status: 400 })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 })
  }

  const rlLead = rateLimit(`otp:enviar:lead:${leadId}`, 3, 60 * 60_000)
  if (!rlLead.allowed) return tooManyRequests(rlLead.retryAfterMs)

  try {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, dadosJson: true } })
    if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

    const otp      = gerarOtp()
    const expiraEm = new Date(Date.now() + OTP_EXPIRY_MS).toISOString()

    const dadosAtuais = (lead.dadosJson as Record<string, unknown>) ?? {}
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        dadosJson: {
          ...dadosAtuais,
          _otpEmail:    email,
          _otpCodigo:   otp,
          _otpExpiraEm: expiraEm,
          _otpVerificado: false,
        },
      },
    })

    const escritorio = await getEscritorioConfig()
    const nomeEscritorio = escritorio.nome ?? 'Avos'
    const primeiroNome = (dadosAtuais['Nome completo'] as string | undefined)?.split(' ')[0] ?? 'Cliente'

    const resultado = await sendEmail({
      para:    email,
      assunto: `Código de verificação — ${nomeEscritorio}`,
      corpo: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:system-ui,-apple-system,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
        <tr><td style="background:#fff;border-radius:16px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a2e;text-align:center">
            Verificação de e-mail
          </h1>
          <p style="margin:0 0 28px;font-size:15px;color:#666;text-align:center;line-height:1.6">
            Olá, ${primeiroNome}! Use o código abaixo para confirmar seu e-mail.
          </p>
          <div style="text-align:center;margin-bottom:28px">
            <div style="display:inline-block;background:#f0f4ff;border:2px dashed #4f7cff;border-radius:12px;padding:20px 40px">
              <span style="font-size:36px;font-weight:800;color:#0C2240;letter-spacing:8px">${otp}</span>
            </div>
          </div>
          <p style="margin:0;font-size:13px;color:#aaa;text-align:center">
            Este código expira em <strong>10 minutos</strong>.<br>
            Se você não solicitou isso, ignore este e-mail.
          </p>
        </td></tr>
        <tr><td style="padding-top:20px;text-align:center">
          <p style="margin:0;font-size:12px;color:#aaa">${nomeEscritorio} · Verificação automática</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    })

    if (!resultado.ok) {
      console.error('[otp/enviar] Falha ao enviar e-mail OTP:', { leadId, erro: resultado.erro })
      Sentry.captureMessage('OTP: falha ao enviar e-mail', {
        level: 'error',
        tags:  { module: 'onboarding-otp', operation: 'enviar' },
        extra: { leadId, erro: resultado.erro },
      })
      return NextResponse.json({ error: 'Falha ao enviar e-mail. Verifique o endereço e tente novamente.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, expiraEm })
  } catch (err) {
    console.error('[otp/enviar] Erro interno:', { leadId, err })
    Sentry.captureException(err, {
      tags:  { module: 'onboarding-otp', operation: 'enviar' },
      extra: { leadId },
    })
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
