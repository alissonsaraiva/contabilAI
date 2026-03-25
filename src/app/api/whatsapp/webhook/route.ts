import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { sendText, type EvolutionConfig } from '@/lib/evolution'
import { askAI, detectarEscalacao } from '@/lib/ai/ask'
import type { AskContext } from '@/lib/ai/ask'
import {
  getOrCreateConversaWhatsapp,
  getHistorico,
  addMensagens,
  atualizarIdentidadeConversa,
} from '@/lib/ai/conversa'

export const runtime = 'nodejs'

// Cache de mensagens já processadas (reinicia com o servidor)
const processed = new Set<string>()

// Cache de identificação: phone → contexto resolvido
// 'desconhecido' = ainda não identificado, sem registro no banco
const phoneCache = new Map<string, {
  clienteId?: string
  leadId?: string
  tipo: 'cliente' | 'lead' | 'prospect' | 'desconhecido'
  conversaId?: string
}>()

// Normaliza número de telefone para busca — retorna variantes
function normalizarPhone(remoteJid: string): string[] {
  const digits = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
  const variants = new Set<string>([
    digits,
    digits.length > 2 ? digits.slice(2) : '',   // sem 55
    digits.length > 4 ? digits.slice(4) : '',   // sem 55+DDD
    digits.length > 3 ? digits.slice(3) : '',   // sem 55+DDD (DDDs antigos 2 dígitos)
  ])
  return [...variants].filter(v => v.length >= 8)
}

async function buscarPorTelefone(phone: string): Promise<{
  clienteId?: string
  leadId?: string
}> {
  const variants = normalizarPhone(phone)
  if (!variants.length) return {}

  const cliente = await prisma.cliente.findFirst({
    where: {
      OR: variants.flatMap(v => [
        { whatsapp: { contains: v } },
        { telefone: { contains: v } },
      ]),
    },
    select: { id: true },
  })
  if (cliente) return { clienteId: cliente.id }

  const lead = await prisma.lead.findFirst({
    where: {
      OR: variants.map(v => ({ contatoEntrada: { contains: v } })),
      status: { notIn: ['cancelado', 'expirado', 'assinado'] },
    },
    orderBy: { criadoEm: 'desc' },
    select: { id: true },
  })
  if (lead) return { leadId: lead.id }

  return {}
}

async function criarLeadWhatsApp(remoteJid: string): Promise<string> {
  const digits = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
  const lead = await prisma.lead.create({
    data: {
      contatoEntrada: digits,
      canal: 'whatsapp',
      funil: 'prospeccao',
      status: 'iniciado',
    },
    select: { id: true },
  })
  return lead.id
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return new Response('bad request', { status: 400 }) }

  const event = (body.event as string ?? '').toLowerCase()
  if (!event.includes('messages')) return new Response('ignored', { status: 200 })

  const data = body.data as Record<string, unknown> | null
  if (!data) return new Response('no data', { status: 200 })

  const key = data.key as Record<string, unknown> | null
  if (!key || key.fromMe) return new Response('fromMe', { status: 200 })

  const messageId = key.id as string
  if (processed.has(messageId)) return new Response('dup', { status: 200 })
  processed.add(messageId)
  if (processed.size > 5000) {
    const first = processed.values().next().value
    if (first) processed.delete(first)
  }

  const remoteJid = key.remoteJid as string
  if (remoteJid.includes('@g.us')) return new Response('group', { status: 200 })

  const msg = data.message as Record<string, unknown> | null
  const text = (
    (msg?.conversation as string | undefined) ||
    ((msg?.extendedTextMessage as Record<string, unknown> | undefined)?.text as string | undefined) ||
    ''
  ).trim()

  if (!text) return new Response('no text', { status: 200 })

  // Carrega config
  let cfg: EvolutionConfig | null = null
  let aiEnabled = false
  let aiFeature = 'whatsapp'

  try {
    const row = await prisma.escritorio.findFirst({
      select: {
        evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true,
        whatsappAiEnabled: true, whatsappAiFeature: true,
      },
    })
    if (row?.evolutionApiUrl && row.evolutionApiKey && row.evolutionInstance) {
      const rawKey = row.evolutionApiKey
      cfg = {
        baseUrl: row.evolutionApiUrl,
        apiKey: rawKey ? (isEncrypted(rawKey) ? decrypt(rawKey) : rawKey) : (process.env.EVOLUTION_API_KEY ?? ''),
        instance: row.evolutionInstance,
      }
    }
    aiEnabled = row?.whatsappAiEnabled ?? false
    aiFeature = row?.whatsappAiFeature ?? 'whatsapp'
  } catch { /* DB indisponível */ }

  if (!cfg || !aiEnabled) return new Response('ai disabled', { status: 200 })

  try {
    // ── Identificação do contato ─────────────────────────────────────────────
    let cached = phoneCache.get(remoteJid)

    if (!cached) {
      const encontrado = await buscarPorTelefone(remoteJid)
      if (encontrado.clienteId) {
        cached = { clienteId: encontrado.clienteId, tipo: 'cliente' }
      } else if (encontrado.leadId) {
        cached = { leadId: encontrado.leadId, tipo: 'lead' }
      } else {
        cached = { tipo: 'desconhecido' }
      }
      phoneCache.set(remoteJid, cached)
    }

    // ── Conversa persistida no banco ─────────────────────────────────────────
    let conversaId = cached.conversaId
    if (!conversaId) {
      conversaId = await getOrCreateConversaWhatsapp(remoteJid, {
        clienteId: cached.clienteId,
        leadId:    cached.leadId,
      })
      cached.conversaId = conversaId
      phoneCache.set(remoteJid, cached)
    }

    // Carrega histórico persistido
    const historico = await getHistorico(conversaId)

    // ── Monta contexto RAG ────────────────────────────────────────────────────
    let context: AskContext
    let systemExtra: string | undefined

    if (cached.clienteId) {
      context = { escopo: 'cliente+global', clienteId: cached.clienteId }
      systemExtra = 'CONTEXTO DO CONTATO: CLIENTE ATIVO'
    } else if (cached.leadId) {
      context = { escopo: 'lead+global', leadId: cached.leadId }
      systemExtra = cached.tipo === 'prospect'
        ? 'CONTEXTO DO CONTATO: PROSPECT (lead registrado, ainda não contratou)'
        : 'CONTEXTO DO CONTATO: LEAD EM ONBOARDING (processo de contratação iniciado)'
    } else {
      context = { escopo: 'global' }
      systemExtra = 'CONTEXTO DO CONTATO: PRIMEIRO CONTATO (não identificado no sistema)'
    }

    // ── Chama a IA ────────────────────────────────────────────────────────────
    const result = await askAI({
      pergunta:   text,
      context,
      feature:    aiFeature as 'whatsapp',
      historico,
      systemExtra,
      maxTokens:  512,
    })

    // ── Detecta marcador ##LEAD## ─────────────────────────────────────────────
    let resposta = result.resposta
    if (cached.tipo === 'desconhecido' && resposta.includes('##LEAD##')) {
      resposta = resposta.replace(/##LEAD##\s*/g, '').trimStart()
      try {
        const leadId = await criarLeadWhatsApp(remoteJid)
        cached = { ...cached, leadId, tipo: 'prospect' }
        phoneCache.set(remoteJid, cached)
        // Associa lead à conversa existente
        atualizarIdentidadeConversa(conversaId, { leadId })
      } catch (err) {
        console.error('[whatsapp/webhook] erro ao criar lead:', err)
      }
    }

    // ── Detecta marcador ##HUMANO## ───────────────────────────────────────────
    const escalInfo = detectarEscalacao(resposta)
    if (escalInfo.escalado) {
      resposta = escalInfo.textoLimpo
      try {
        // Passa o histórico completo (inclui a mensagem atual) para a escalação
        const historicoEscalacao = [
          ...historico,
          { role: 'user' as const, content: text },
          { role: 'assistant' as const, content: resposta },
        ]
        await prisma.escalacao.create({
          data: {
            canal:          'whatsapp',
            status:         'pendente',
            clienteId:      cached.clienteId ?? null,
            leadId:         cached.leadId    ?? null,
            remoteJid,
            historico:      historicoEscalacao as object[],
            ultimaMensagem: text,
            motivoIA:       escalInfo.motivo,
          },
        })
      } catch (err) {
        console.error('[whatsapp/webhook] erro ao criar escalação:', err)
      }
    }

    // ── Persiste par user+assistant no banco ──────────────────────────────────
    addMensagens(conversaId, text, resposta)

    await sendText(cfg, remoteJid, resposta)
  } catch (err) {
    console.error('[whatsapp/webhook] erro:', err)
  }

  return new Response('ok', { status: 200 })
}

export async function GET() {
  return new Response('ok', { status: 200 })
}
