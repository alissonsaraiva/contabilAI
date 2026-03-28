import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/send'
import { criarTokenPortal, criarTokenPortalSocio } from '@/lib/portal/tokens'

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email_invalido' }, { status: 400 })
  }

  const emailNorm = email.trim().toLowerCase()

  // Verifica primeiro se é titular
  const cliente = await prisma.cliente.findUnique({
    where:  { email: emailNorm },
    select: { id: true, nome: true, status: true, empresaId: true },
  })

  if (cliente) {
    if (cliente.status === 'suspenso')  return NextResponse.json({ error: 'conta_suspensa' },         { status: 403 })
    if (cliente.status === 'cancelado') return NextResponse.json({ error: 'conta_cancelada' },        { status: 403 })
    if (!cliente.empresaId)             return NextResponse.json({ error: 'empresa_nao_vinculada' },  { status: 400 })

    const link = await criarTokenPortal(cliente.id, cliente.empresaId, 30 * 60 * 1000)
    await enviarEmailAcesso(emailNorm, cliente.nome, link)
    return NextResponse.json({ ok: true })
  }

  // Verifica se é sócio com acesso ao portal
  const socio = await prisma.socio.findFirst({
    where:  { email: emailNorm, portalAccess: true },
    select: { id: true, nome: true, empresaId: true },
  })

  if (socio) {
    const link = await criarTokenPortalSocio(socio.id, socio.empresaId, 30 * 60 * 1000)
    await enviarEmailAcesso(emailNorm, socio.nome, link)
    return NextResponse.json({ ok: true })
  }

  // Retorna 404 genérico para não revelar se o email existe
  return NextResponse.json({ error: 'email_nao_cadastrado' }, { status: 404 })
}

async function enviarEmailAcesso(email: string, nomeCompleto: string, link: string) {
  const nome = nomeCompleto.split(' ')[0]
  await sendEmail({
    para:    email,
    assunto: 'Seu link de acesso ao Portal',
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
}
