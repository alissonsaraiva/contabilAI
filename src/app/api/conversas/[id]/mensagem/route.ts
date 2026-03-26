import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { isEncrypted, decrypt } from '@/lib/crypto'
import { sendHumanLike } from '@/lib/whatsapp/human-like'
import type { EvolutionConfig } from '@/lib/evolution'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user = session?.user as any
  if (!session || (user?.tipo !== 'admin' && user?.tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params
  const { texto } = await req.json() as { texto: string }
  if (!texto?.trim()) return NextResponse.json({ error: 'texto obrigatório' }, { status: 400 })

  const conversa = await prisma.conversaIA.findUnique({
    where: { id },
    select: { id: true, canal: true, remoteJid: true, pausadaEm: true },
  })
  if (!conversa) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

  // Persiste a mensagem do humano como role 'assistant' (é uma resposta ao cliente)
  await prisma.mensagemIA.create({
    data: { conversaId: id, role: 'assistant', conteudo: texto.trim(), status: 'pending' },
  })

  // Entrega via Escalacao para onboarding (widget faz poll)
  if (conversa.canal === 'onboarding') {
    try {
      const convRow = await prisma.conversaIA.findUnique({
        where: { id },
        select: { leadId: true, sessionId: true },
      })
      const escalacao = await prisma.escalacao.findFirst({
        where: {
          canal: 'onboarding',
          status: { in: ['pendente', 'em_atendimento'] },
          ...(convRow?.leadId
            ? { leadId: convRow.leadId }
            : { sessionId: convRow?.sessionId ?? undefined }),
        },
        orderBy: { criadoEm: 'desc' },
      })
      if (escalacao) {
        await prisma.escalacao.update({
          where: { id: escalacao.id },
          data: { respostaEnviada: texto.trim(), status: 'resolvida' },
        })
        await prisma.mensagemIA.updateMany({
          where: { conversaId: id, role: 'assistant', status: 'pending' },
          data: { status: 'sent' },
        })
      }
    } catch (err) {
      console.error('[conversas/mensagem] erro ao entregar via escalação:', err)
    }
    return NextResponse.json({ ok: true })
  }

  // Envia via WhatsApp se aplicável
  if (conversa.canal === 'whatsapp' && conversa.remoteJid) {
    const row = await prisma.escritorio.findFirst({
      select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
    })

    if (row?.evolutionApiUrl && row.evolutionApiKey && row.evolutionInstance) {
      const cfg: EvolutionConfig = {
        baseUrl: row.evolutionApiUrl,
        apiKey: isEncrypted(row.evolutionApiKey) ? decrypt(row.evolutionApiKey) : row.evolutionApiKey,
        instance: row.evolutionInstance,
      }
      const result = await sendHumanLike(cfg, conversa.remoteJid, texto.trim())
      if (result.ok) {
        // Atualiza status da última mensagem para 'sent'
        const ultima = await prisma.mensagemIA.findFirst({
          where: { conversaId: id, role: 'assistant' },
          orderBy: { criadaEm: 'desc' },
        })
        if (ultima) {
          await prisma.mensagemIA.update({ where: { id: ultima.id }, data: { status: 'sent' } })
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
