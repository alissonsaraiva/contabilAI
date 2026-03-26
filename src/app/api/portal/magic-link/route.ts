import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/send'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email_invalido' }, { status: 400 })
  }

  const emailNorm = email.trim().toLowerCase()

  const cliente = await prisma.cliente.findUnique({
    where:  { email: emailNorm },
    select: { id: true, nome: true, status: true },
  })

  if (!cliente) {
    return NextResponse.json({ error: 'email_nao_cadastrado' }, { status: 404 })
  }
  if (cliente.status === 'cancelado' || cliente.status === 'encerrado') {
    return NextResponse.json({ error: 'conta_inativa' }, { status: 403 })
  }

  // Gera token e hash
  const rawToken = crypto.randomBytes(32).toString('base64url')
  const hash     = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 min

  // Remove tokens antigos deste cliente
  await prisma.portalToken.deleteMany({ where: { clienteId: cliente.id } })

  await prisma.portalToken.create({
    data: { clienteId: cliente.id, token: hash, expiresAt },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const link    = `${baseUrl}/portal/verificar?token=${rawToken}`

  const nome = cliente.nome.split(' ')[0]

  await sendEmail({
    para:    emailNorm,
    assunto: 'Seu link de acesso ao Portal do Cliente',
    corpo: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:8px;font-size:20px">Olá, ${nome}!</h2>
        <p style="color:#555;margin-bottom:24px">
          Clique no botão abaixo para acessar sua área exclusiva no Portal ContabAI.
          O link é válido por <strong>30 minutos</strong>.
        </p>
        <a href="${link}"
           style="display:inline-block;background:#6366F1;color:#fff;font-weight:600;
                  padding:12px 28px;border-radius:10px;text-decoration:none;font-size:15px">
          Acessar Portal
        </a>
        <p style="margin-top:24px;font-size:12px;color:#999">
          Se você não solicitou este acesso, ignore este e-mail.<br>
          Nunca compartilhe este link com ninguém.
        </p>
      </div>
    `,
  })

  return NextResponse.json({ ok: true })
}
