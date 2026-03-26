import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { sendText, type EvolutionConfig } from '@/lib/evolution'
import { decrypt, isEncrypted } from '@/lib/crypto'

type Params = { params: Promise<{ id: string }> }

function buildRemoteJid(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  return `${withCountry}@s.whatsapp.net`
}

async function getEvolutionConfig(): Promise<EvolutionConfig | null> {
  const row = await prisma.escritorio.findFirst({
    select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
  })
  if (!row?.evolutionApiUrl || !row.evolutionApiKey || !row.evolutionInstance) return null
  const rawKey = row.evolutionApiKey
  return {
    baseUrl: row.evolutionApiUrl,
    apiKey: rawKey ? (isEncrypted(rawKey) ? decrypt(rawKey) : rawKey) : (process.env.EVOLUTION_API_KEY ?? ''),
    instance: row.evolutionInstance,
  }
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    select: { whatsapp: true, telefone: true },
  })
  if (!cliente) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const phone = cliente.whatsapp || cliente.telefone
  if (!phone) return NextResponse.json({ conversa: null, mensagens: [], pausada: false })

  const remoteJid = buildRemoteJid(phone)

  const conversa = await prisma.conversaIA.findFirst({
    where: { canal: 'whatsapp', remoteJid },
    orderBy: { atualizadaEm: 'desc' },
    include: { mensagens: { orderBy: { criadaEm: 'asc' } } },
  })

  return NextResponse.json({
    conversa: conversa ? { id: conversa.id, pausadaEm: conversa.pausadaEm } : null,
    mensagens: conversa?.mensagens ?? [],
    pausada: !!conversa?.pausadaEm,
    remoteJid,
    telefone: phone,
  })
}

export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const conteudo = body?.conteudo?.trim()
  if (!conteudo) return NextResponse.json({ error: 'Conteúdo obrigatório' }, { status: 400 })

  const cliente = await prisma.cliente.findUnique({
    where: { id },
    select: { whatsapp: true, telefone: true },
  })
  if (!cliente) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const phone = cliente.whatsapp || cliente.telefone
  if (!phone) return NextResponse.json({ error: 'Cliente sem número de telefone/WhatsApp' }, { status: 400 })

  const cfg = await getEvolutionConfig()
  if (!cfg) return NextResponse.json({ error: 'WhatsApp não configurado no escritório' }, { status: 400 })

  const remoteJid = buildRemoteJid(phone)

  // Busca conversa existente (qualquer idade) ou cria nova
  let conversa = await prisma.conversaIA.findFirst({
    where: { canal: 'whatsapp', remoteJid },
    orderBy: { atualizadaEm: 'desc' },
    select: { id: true },
  })

  if (!conversa) {
    conversa = await prisma.conversaIA.create({
      data: { canal: 'whatsapp', remoteJid, clienteId: id },
      select: { id: true },
    })
  }

  // Pausa a IA e salva mensagem do operador
  await prisma.$transaction([
    prisma.conversaIA.update({
      where: { id: conversa.id },
      data: { pausadaEm: new Date(), pausadoPorId: session.user.id, atualizadaEm: new Date() },
    }),
    prisma.mensagemIA.create({
      data: { conversaId: conversa.id, role: 'assistant', conteudo },
    }),
    prisma.interacao.create({
      data: {
        clienteId: id,
        usuarioId: session.user.id,
        tipo: 'whatsapp_enviado',
        titulo: 'WhatsApp enviado',
        conteudo,
      },
    }),
  ])

  // Envia via Evolution API
  await sendText(cfg, remoteJid, conteudo)

  // Indexa no RAG (fire-and-forget)
  import('@/lib/rag/ingest').then(({ indexarInteracao }) =>
    indexarInteracao({
      id: conversa!.id,
      clienteId: id,
      tipo: 'whatsapp_enviado',
      titulo: 'WhatsApp enviado pelo escritório',
      conteudo,
      criadoEm: new Date(),
    })
  ).catch(() => {})

  return NextResponse.json({ ok: true, conversaId: conversa.id })
}
