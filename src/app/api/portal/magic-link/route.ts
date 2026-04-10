import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/send'
import { criarTokenPortal, criarTokenPortalSocio } from '@/lib/portal/tokens'
import { getEmpresasCliente, getEmpresaPrincipal } from '@/lib/portal-session'

// ── Rate limiting em memória por IP ───────────────────────────────────────────
// Limite: 5 tentativas por IP a cada 10 minutos
// Protege contra enumeração de emails e abuso de envio de magic link
const MAGIC_LINK_RATE_LIMIT = 5
const MAGIC_LINK_WINDOW_MS = 10 * 60 * 1000 // 10 minutos

const attempts = new Map<string, { count: number; resetAt: number }>()

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const slot = attempts.get(ip)

  if (!slot || now > slot.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + MAGIC_LINK_WINDOW_MS })
    return true // permitido
  }

  if (slot.count >= MAGIC_LINK_RATE_LIMIT) return false // bloqueado

  slot.count++
  return true // permitido
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'too_many_requests' },
      { status: 429, headers: { 'Retry-After': '600' } },
    )
  }

  const { email } = await req.json()
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email_invalido' }, { status: 400 })
  }

  const emailNorm = email.trim().toLowerCase()

  // Verifica primeiro se é titular
  const cliente = await prisma.cliente.findUnique({
    where: { email: emailNorm },
    select: { id: true, nome: true, status: true, empresaId: true },
  })

  if (cliente) {
    if (cliente.status === 'suspenso') return NextResponse.json({ error: 'conta_suspensa' }, { status: 403 })
    if (cliente.status === 'cancelado') return NextResponse.json({ error: 'conta_cancelada' }, { status: 403 })
    const empresaId = await getEmpresaPrincipal(cliente.id)
    if (!empresaId) return NextResponse.json({ error: 'empresa_nao_vinculada' }, { status: 400 })

    const { link, otp } = await criarTokenPortal(cliente.id, empresaId, 30 * 60 * 1000)
    await enviarEmailAcesso(emailNorm, cliente.nome, link, otp)
    return NextResponse.json({ ok: true })
  }

  // Verifica se é sócio com acesso ao portal
  const socio = await prisma.socio.findFirst({
    where: { email: emailNorm, portalAccess: true },
    select: { id: true, nome: true, empresaId: true },
  })

  if (socio) {
    const { link, otp } = await criarTokenPortalSocio(socio.id, socio.empresaId, 30 * 60 * 1000)
    await enviarEmailAcesso(emailNorm, socio.nome, link, otp)
    return NextResponse.json({ ok: true })
  }

  // Retorna 404 genérico para não revelar se o email existe
  return NextResponse.json({ error: 'email_nao_cadastrado' }, { status: 404 })
}

async function enviarEmailAcesso(email: string, nomeCompleto: string, link: string, otp: string) {
  const nome = nomeCompleto.split(' ')[0]
  await sendEmail({
    para: email,
    assunto: 'Seu código de acesso ao Portal',
    corpo: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:8px;font-size:20px">Olá, ${nome}!</h2>
        <p style="color:#555;margin-bottom:24px">
          Use o código abaixo para acessar sua área exclusiva. Válido por <strong>10 minutos</strong>.
        </p>

        <div style="background:#f5f5f5;border-radius:12px;padding:20px 24px;text-align:center;margin-bottom:24px">
          <p style="margin:0 0 4px;font-size:13px;color:#888;letter-spacing:.05em;text-transform:uppercase">Código de acesso</p>
          <p style="margin:0;font-size:40px;font-weight:700;letter-spacing:.18em;color:#1a1a1a">${otp}</p>
        </div>

        <p style="color:#555;margin-bottom:16px;font-size:14px">
          Prefere entrar com um clique? Use o botão abaixo (link válido por 30 minutos):
        </p>
        <a href="${link}"
           style="display:inline-block;background:#6366F1;color:#fff;font-weight:600;
                  padding:12px 28px;border-radius:10px;text-decoration:none;font-size:15px">
          Acessar Portal
        </a>
        <p style="margin-top:24px;font-size:12px;color:#999">
          Se você não solicitou este acesso, ignore este e-mail.<br>
          Nunca compartilhe este código ou link com ninguém.
        </p>
      </div>
    `,
  })
}
