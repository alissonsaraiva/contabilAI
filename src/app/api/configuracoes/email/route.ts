import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { encrypt, maskKey, isEncrypted } from '@/lib/crypto'
import { testarConexaoSmtp } from '@/lib/email/send'

// GET — retorna config com senha mascarada
export async function GET() {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const row = await prisma.escritorio.findFirst({
    select: { emailRemetente: true, emailNome: true, emailSenha: true, emailSmtpHost: true, emailSmtpPort: true, emailImapHost: true, emailImapPort: true },
  })

  return NextResponse.json({
    emailRemetente: row?.emailRemetente ?? '',
    emailNome:      row?.emailNome      ?? '',
    emailSenha:     row?.emailSenha ? maskKey(row.emailSenha) : '',
    emailSmtpHost:  row?.emailSmtpHost  ?? '',
    emailSmtpPort:  row?.emailSmtpPort  ?? '',
    emailImapHost:  row?.emailImapHost  ?? '',
    emailImapPort:  row?.emailImapPort  ?? '',
  })
}

// PUT — salva config, encriptando a senha
export async function PUT(req: Request) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { emailRemetente, emailNome, emailSenha, emailSmtpHost, emailSmtpPort, emailImapHost, emailImapPort } = await req.json() as {
    emailRemetente?: string
    emailNome?:      string
    emailSenha?:     string
    emailSmtpHost?:  string
    emailSmtpPort?:  number | string
    emailImapHost?:  string
    emailImapPort?:  number | string
  }

  const data: Record<string, unknown> = {}
  if (emailRemetente !== undefined) data.emailRemetente = emailRemetente
  if (emailNome      !== undefined) data.emailNome      = emailNome
  if (emailSenha !== undefined && emailSenha.trim() && !emailSenha.startsWith('••')) {
    data.emailSenha = isEncrypted(emailSenha) ? emailSenha : encrypt(emailSenha)
  }
  if (emailSmtpHost !== undefined) data.emailSmtpHost = emailSmtpHost || null
  if (emailSmtpPort !== undefined) data.emailSmtpPort = emailSmtpPort ? Number(emailSmtpPort) : null
  if (emailImapHost !== undefined) data.emailImapHost = emailImapHost || null
  if (emailImapPort !== undefined) data.emailImapPort = emailImapPort ? Number(emailImapPort) : null

  await prisma.escritorio.upsert({
    where:  { id: 'singleton' },
    update: data,
    create: { id: 'singleton', ...data },
  })

  return NextResponse.json({ ok: true })
}

// POST /api/configuracoes/email/testar — verifica conexão SMTP
export async function POST() {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const resultado = await testarConexaoSmtp()
  return NextResponse.json(resultado)
}
