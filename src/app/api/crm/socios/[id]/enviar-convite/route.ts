import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { criarTokenPortalSocio } from '@/lib/portal/tokens'
import { sendEmail } from '@/lib/email/send'

type Params = { params: Promise<{ id: string }> }

/** POST — habilita portalAccess (se ainda não) e envia magic link ao sócio */
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  const socio = await prisma.socio.findUnique({
    where:  { id },
    select: { id: true, nome: true, email: true, empresaId: true, portalAccess: true },
  })

  if (!socio)        return NextResponse.json({ error: 'Sócio não encontrado' }, { status: 404 })
  if (!socio.email)  return NextResponse.json({ error: 'Sócio sem e-mail cadastrado' }, { status: 400 })

  // Habilita acesso automaticamente ao enviar o convite
  if (!socio.portalAccess) {
    await prisma.socio.update({ where: { id }, data: { portalAccess: true } })
  }

  const { link } = await criarTokenPortalSocio(socio.id, socio.empresaId, 24 * 60 * 60 * 1000)
  const nome = socio.nome.split(' ')[0]

  await sendEmail({
    para:    socio.email,
    assunto: 'Convite de acesso ao Portal da Empresa',
    corpo: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin-bottom:8px;font-size:20px">Olá, ${nome}!</h2>
        <p style="color:#555;margin-bottom:24px">
          Você foi convidado(a) a acessar o Portal da Empresa no ContabAI.<br>
          Clique no botão abaixo para criar seu acesso. O link é válido por <strong>24 horas</strong>.
        </p>
        <a href="${link}"
           style="display:inline-block;background:#6366F1;color:#fff;font-weight:600;
                  padding:12px 28px;border-radius:10px;text-decoration:none;font-size:15px">
          Acessar Portal
        </a>
        <p style="margin-top:24px;font-size:12px;color:#999">
          Se você não esperava este e-mail, pode ignorá-lo com segurança.<br>
          Nunca compartilhe este link com ninguém.
        </p>
      </div>
    `,
  })

  return NextResponse.json({ ok: true, email: socio.email })
}
