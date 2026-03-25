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
    select: { emailRemetente: true, emailNome: true, emailSenha: true },
  })

  return NextResponse.json({
    emailRemetente: row?.emailRemetente ?? '',
    emailNome:      row?.emailNome      ?? '',
    emailSenha:     row?.emailSenha ? maskKey(row.emailSenha) : '',
  })
}

// PUT — salva config, encriptando a senha
export async function PUT(req: Request) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { emailRemetente, emailNome, emailSenha } = await req.json() as {
    emailRemetente?: string
    emailNome?:      string
    emailSenha?:     string
  }

  const data: Record<string, string> = {}
  if (emailRemetente !== undefined) data.emailRemetente = emailRemetente
  if (emailNome      !== undefined) data.emailNome      = emailNome
  if (emailSenha !== undefined && emailSenha.trim() && !emailSenha.startsWith('••')) {
    // Só encripta se for um valor novo (não é a máscara retornada pelo GET)
    data.emailSenha = isEncrypted(emailSenha) ? emailSenha : encrypt(emailSenha)
  }

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
