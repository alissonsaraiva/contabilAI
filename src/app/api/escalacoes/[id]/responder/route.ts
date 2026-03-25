import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { sendText } from '@/lib/evolution'
import { getProvider } from '@/lib/ai/providers'
import { getAiConfig } from '@/lib/ai/config'
import { SYSTEM_BASE_DEFAULT } from '@/lib/ai/ask'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const { modo, conteudo } = await req.json() as { modo: 'ia' | 'direto'; conteudo: string }

  if (!modo || !conteudo?.trim()) {
    return NextResponse.json({ error: 'modo e conteudo são obrigatórios' }, { status: 400 })
  }

  const esc = await prisma.escalacao.findUnique({ where: { id } })
  if (!esc) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (esc.status === 'resolvida') {
    return NextResponse.json({ error: 'escalação já resolvida' }, { status: 409 })
  }

  let mensagemFinal = conteudo.trim()

  // ── Modo IA: reformula no tom da Clara ──────────────────────────────────────
  if (modo === 'ia') {
    try {
      const config = await getAiConfig()
      const provider = getProvider(config.provider)
      const historico = (esc.historico as { role: string; content: string }[]) ?? []
      const ctxStr = historico
        .slice(-6)
        .map(m => `${m.role === 'user' ? 'Cliente' : 'Clara'}: ${m.content}`)
        .join('\n')

      const systemReformula = `${SYSTEM_BASE_DEFAULT}

Você receberá uma orientação de um membro da equipe e deve reformulá-la no seu tom natural de assistente Clara — cordial, direto e em português brasileiro. NÃO mencione que recebeu orientação de alguém. Responda como se fosse sua própria resposta.`

      const result = await provider.complete({
        system: systemReformula,
        messages: [
          {
            role: 'user',
            content: `Contexto da conversa recente:\n${ctxStr}\n\nOrientação da equipe: ${conteudo}\n\nReformule no seu tom para enviar ao cliente.`,
          },
        ],
        maxTokens: 512,
        temperature: 0.4,
        model: config.models.whatsapp ?? config.models.onboarding,
        apiKey:
          config.provider === 'claude'  ? config.anthropicApiKey ?? undefined :
          config.provider === 'google'  ? config.googleApiKey    ?? undefined :
                                          config.openaiApiKey    ?? undefined,
      })
      mensagemFinal = result.text
    } catch (err) {
      console.error('[escalacoes/responder] erro ao reformular:', err)
      // Se a reformulação falhar, usa o conteúdo original
    }
  }

  // ── Envia pelo canal correto ────────────────────────────────────────────────
  if (esc.canal === 'whatsapp' && esc.remoteJid) {
    try {
      const row = await prisma.escritorio.findFirst({
        select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
      })
      if (row?.evolutionApiUrl && row.evolutionApiKey && row.evolutionInstance) {
        const rawKey = row.evolutionApiKey
        const apiKey = isEncrypted(rawKey) ? decrypt(rawKey) : rawKey
        await sendText(
          { baseUrl: row.evolutionApiUrl, apiKey, instance: row.evolutionInstance },
          esc.remoteJid,
          mensagemFinal,
        )
      }
    } catch (err) {
      console.error('[escalacoes/responder] erro ao enviar WhatsApp:', err)
      return NextResponse.json({ error: 'erro ao enviar mensagem' }, { status: 500 })
    }
  }
  // Canal onboarding: a resposta fica em respostaEnviada — o widget faz poll e exibe

  // ── Atualiza escalação no banco ─────────────────────────────────────────────
  await prisma.escalacao.update({
    where: { id },
    data: {
      status: 'resolvida',
      operadorId: session.user.id,
      orientacaoHumana: conteudo,
      respostaEnviada: mensagemFinal,
    },
  })

  return NextResponse.json({ ok: true, mensagemEnviada: mensagemFinal })
}
