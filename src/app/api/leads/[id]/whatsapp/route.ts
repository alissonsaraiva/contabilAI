import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { sendText, sendMedia, type EvolutionConfig } from '@/lib/evolution'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { indexarAsync } from '@/lib/rag/indexar-async'

type Params = { params: Promise<{ id: string }> }

/** Extrai telefone de um lead: tenta dadosJson > contatoEntrada numérico */
function extrairTelefone(lead: {
  contatoEntrada: string
  dadosJson: unknown
}): string | null {
  const dados = lead.dadosJson as Record<string, string> | null
  const candidatos = [
    dados?.['WhatsApp'],
    dados?.['Telefone'],
    dados?.['Celular'],
    // contatoEntrada só vale se parecer telefone (mín. 8 dígitos, sem letras)
    /^\+?[\d\s()\-]{8,}$/.test(lead.contatoEntrada) ? lead.contatoEntrada : null,
  ]
  return candidatos.find(v => v && v.replace(/\D/g, '').length >= 8) ?? null
}

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
  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { contatoEntrada: true, dadosJson: true },
  })
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const phone = extrairTelefone(lead)
  if (!phone) return NextResponse.json({ conversa: null, mensagens: [], pausada: false, telefone: null })

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
  const conteudo      = (body?.conteudo as string | undefined)?.trim() ?? ''
  const mediaUrl      = (body?.mediaUrl      as string | undefined) ?? null
  const mediaType     = (body?.mediaType     as string | undefined) ?? null
  const mediaFileName = (body?.mediaFileName as string | undefined) ?? null
  const mediaMimeType = (body?.mediaMimeType as string | undefined) ?? null
  if (!conteudo && !mediaUrl) return NextResponse.json({ error: 'Conteúdo ou arquivo obrigatório' }, { status: 400 })

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { contatoEntrada: true, dadosJson: true },
  })
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const phone = extrairTelefone(lead)
  if (!phone) return NextResponse.json({ error: 'Lead sem número de telefone/WhatsApp identificável' }, { status: 400 })

  const cfg = await getEvolutionConfig()
  if (!cfg) return NextResponse.json({ error: 'WhatsApp não configurado no escritório' }, { status: 400 })

  const remoteJid = buildRemoteJid(phone)

  // Busca conversa existente ou cria nova
  let conversa = await prisma.conversaIA.findFirst({
    where: { canal: 'whatsapp', remoteJid },
    orderBy: { atualizadaEm: 'desc' },
    select: { id: true },
  })

  if (!conversa) {
    conversa = await prisma.conversaIA.create({
      data: { canal: 'whatsapp', remoteJid, leadId: id },
      select: { id: true },
    })
  }

  // Fase 1: pausa a IA e registra a interação (independente do resultado do envio)
  await prisma.$transaction([
    prisma.conversaIA.update({
      where: { id: conversa.id },
      data: { pausadaEm: new Date(), pausadoPorId: session.user.id, atualizadaEm: new Date() },
    }),
    prisma.interacao.create({
      data: {
        leadId: id,
        usuarioId: session.user.id,
        tipo: 'whatsapp_enviado',
        titulo: 'WhatsApp enviado',
        conteudo: conteudo || (mediaFileName ? `[Arquivo: ${mediaFileName}]` : '[Mídia enviada]'),
      },
    }),
  ])

  // Fase 2: tenta enviar via Evolution API (com retry automático)
  const sendResult = mediaUrl
    ? await sendMedia(cfg, remoteJid, {
        mediatype: (mediaType === 'image' ? 'image' : 'document') as 'image' | 'document',
        mimetype:  mediaMimeType ?? 'application/octet-stream',
        fileName:  mediaFileName ?? 'arquivo',
        caption:   conteudo || undefined,
        mediaUrl,
      })
    : await sendText(cfg, remoteJid, conteudo)

  // Fase 3: persiste a mensagem com o status correto
  await prisma.mensagemIA.create({
    data: {
      conversaId: conversa.id,
      role: 'assistant',
      conteudo,
      status: sendResult.ok ? 'sent' : 'failed',
      tentativas: sendResult.ok ? 1 : ('attempts' in sendResult ? sendResult.attempts : 1),
      erroEnvio: sendResult.ok ? null : sendResult.error,
      mediaUrl,
      mediaType,
      mediaFileName,
      mediaMimeType,
    },
  })

  // Indexa no RAG (fire-and-forget)
  indexarAsync('interacao', {
    id:       conversa!.id,
    leadId:   id,
    tipo:     'whatsapp_enviado',
    titulo:   'WhatsApp enviado pelo escritório',
    conteudo,
    criadoEm: new Date(),
  })

  if (!sendResult.ok) {
    return NextResponse.json(
      { error: 'Mensagem salva, mas falha ao entregar via WhatsApp', detail: sendResult.error },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true, conversaId: conversa.id })
}
