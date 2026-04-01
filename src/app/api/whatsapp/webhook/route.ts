import { prisma } from '@/lib/prisma'
import { emitWhatsAppRefresh } from '@/lib/event-bus'
import { decrypt, isEncrypted } from '@/lib/crypto'
import type { EvolutionConfig } from '@/lib/evolution'
import {
  getOrCreateConversaWhatsapp,
  getHistorico,
} from '@/lib/ai/conversa'
import { sendHumanLike } from '@/lib/whatsapp/human-like'
import { downloadMedia, detectMediaType, extractMediaCaption, extractMimeType, extractPdfText } from '@/lib/whatsapp/media'
import { transcribeAudio } from '@/lib/ai/transcribe'
import type { AIMessageContentPart } from '@/lib/ai/providers/types'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { classificarDocumento, buildContextoConversa } from '@/lib/services/classificar-documento'
import { criarDocumento } from '@/lib/services/documentos'
// Garante que todas as tools estejam registradas
import '@/lib/ai/tools'

export const runtime = 'nodejs'

// Cache de mensagens já processadas (reinicia com o servidor)
const processed = new Set<string>()

// Rate limiting: timestamp da última resposta enviada por número
const lastResponse = new Map<string, number>()
const RATE_LIMIT_MS = 3000

// Limite de tamanho de mensagem antes de enviar para a IA
const MAX_MSG_LENGTH = 1000

// Padrões de jailbreak/prompt injection mais comuns
const JAILBREAK_PATTERNS = [
  /ignore\s+(previous|all|above|prior)\s+instructions?/i,
  /forget\s+(everything|all|your)\s+(you|instructions?|rules?)/i,
  /you\s+are\s+now\s+(a\s+)?(different|new|another|unrestricted)/i,
  /act\s+as\s+(if\s+you\s+are\s+)?(a\s+)?(different|unrestricted|evil|jailbreak)/i,
  /developer\s+mode/i,
  /jailbreak/i,
  /bypass\s+(your\s+)?(filter|restriction|rule|guideline)/i,
  /pretend\s+(you\s+have\s+no|you\s+are\s+not|there\s+are\s+no)/i,
  /\bDAN\b/,                          // "Do Anything Now" jailbreak
  /\[SYSTEM\]/i,                      // tentativa de injetar bloco SYSTEM
  /\[INST\]/i,                        // Llama instruction format injection
  /<\|im_start\|>/i,                  // ChatML injection
  /\{\{.*\}\}/,                       // template injection
]

// Cache de identificação: phone → contexto resolvido
// 'desconhecido' = ainda não identificado, sem registro no banco
// TTL de 30min: evita contexto obsoleto (ex: lead que virou cliente)
const PHONE_CACHE_TTL_MS = 30 * 60 * 1000
const phoneCache = new Map<string, {
  clienteId?: string
  leadId?: string
  socioId?: string
  tipo: 'cliente' | 'lead' | 'socio' | 'prospect' | 'desconhecido'
  conversaId?: string
  cachedAt: number
}>()

// Normaliza número de telefone para busca — retorna variantes
// Cobre: com/sem código do país, com/sem 9º dígito (celulares BR)
function normalizarPhone(remoteJid: string): string[] {
  const digits = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
  const variants = new Set<string>([
    digits,
    digits.length > 2 ? digits.slice(2) : '',  // sem 55
    digits.length > 4 ? digits.slice(4) : '',  // sem 55+DDD
    digits.length > 3 ? digits.slice(3) : '',  // sem 55+DDD (DDDs antigos)
  ])
  // Celulares brasileiros: migração de 8→9 dígitos após o DDD
  // 12 dígitos (55+DDD+8d) → também tenta com 9 (55+DDD+9+8d = 13d)
  if (digits.length === 12 && digits.startsWith('55')) {
    const com9 = digits.slice(0, 4) + '9' + digits.slice(4)
    variants.add(com9)
    variants.add(com9.slice(2)) // sem 55
  }
  // 13 dígitos (55+DDD+9+8d) → também tenta sem 9 (55+DDD+8d = 12d)
  if (digits.length === 13 && digits.startsWith('55') && digits[4] === '9') {
    const sem9 = digits.slice(0, 4) + digits.slice(5)
    variants.add(sem9)
    variants.add(sem9.slice(2)) // sem 55
  }
  return [...variants].filter(v => v.length >= 8)
}

async function buscarPorTelefone(phone: string): Promise<{
  clienteId?: string
  leadId?: string
  socioId?: string
}> {
  const variants = normalizarPhone(phone)
  if (!variants.length) return {}

  // Usa SQL bruto com regexp_replace para ignorar formatação (parênteses, hífens, espaços)
  // nos campos de telefone/whatsapp armazenados no banco (ex: "(85) 98118-6338" → "85981186338")

  // 1. Busca titular (cliente direto)
  const clienteRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM clientes
    WHERE regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = ANY(${variants})
       OR regexp_replace(COALESCE(whatsapp, ''), '[^0-9]', '', 'g') = ANY(${variants})
    LIMIT 1
  `
  if (clienteRows.length > 0) return { clienteId: clienteRows[0].id }

  // 2. Busca sócio — associado a uma empresa que tem cliente vinculado
  const socioRows = await prisma.$queryRaw<{ id: string; clienteId: string | null }[]>`
    SELECT s.id, e."clienteId"
    FROM socios s
    LEFT JOIN empresas e ON e.id = s."empresaId"
    WHERE regexp_replace(COALESCE(s.telefone, ''), '[^0-9]', '', 'g') = ANY(${variants})
       OR regexp_replace(COALESCE(s.whatsapp, ''), '[^0-9]', '', 'g') = ANY(${variants})
    LIMIT 1
  `
  if (socioRows.length > 0) {
    return {
      socioId:   socioRows[0].id,
      clienteId: socioRows[0].clienteId ?? undefined,
    }
  }

  // 3. Busca lead
  const leadRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM leads
    WHERE regexp_replace(COALESCE("contatoEntrada", ''), '[^0-9]', '', 'g') = ANY(${variants})
      AND status NOT IN ('cancelado', 'expirado', 'assinado')
    ORDER BY "criadoEm" DESC
    LIMIT 1
  `
  if (leadRows.length > 0) return { leadId: leadRows[0].id }

  return {}
}


export async function POST(req: Request) {
  // Verificação estática antecipada — rejeita antes de qualquer acesso ao banco
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET
  if (WEBHOOK_SECRET) {
    const headerApiKey = req.headers.get('apikey')
    if (headerApiKey !== WEBHOOK_SECRET) {
      return new Response('unauthorized', { status: 401 })
    }
  }

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

  // ── Filtra origens não-humanas ────────────────────────────────────────────
  // Grupos — @g.us
  if (remoteJid.includes('@g.us')) return new Response('group', { status: 200 })
  // Status/stories do WhatsApp — @broadcast ou status@broadcast
  if (remoteJid.includes('@broadcast') || remoteJid.startsWith('status@')) return new Response('broadcast', { status: 200 })
  // Canais/newsletters — @newsletter
  if (remoteJid.includes('@newsletter')) return new Response('newsletter', { status: 200 })

  // ── Filtra tipos de mensagem que não exigem resposta da IA ────────────────
  const msg = data.message as Record<string, unknown> | null

  // Reações (👍 ❤️ etc.) — não geram resposta
  if (msg?.reactionMessage) return new Response('reaction', { status: 200 })
  // Mensagens editadas — não reprocessar
  if (msg?.editedMessage || (data.messageType as string) === 'editedMessage') return new Response('edit', { status: 200 })
  // Mensagens deletadas/revogadas
  if (msg?.protocolMessage) return new Response('protocol', { status: 200 })
  // Notificações de sistema (entrou no grupo, alterou número, etc.)
  if (data.messageStubType) return new Response('stub', { status: 200 })
  // Enquetes
  if (msg?.pollCreationMessage || msg?.pollUpdateMessage) return new Response('poll', { status: 200 })
  // Contatos e localização — sem resposta útil por enquanto
  if (msg?.contactMessage || msg?.contactsArrayMessage) return new Response('contact', { status: 200 })
  if (msg?.locationMessage || msg?.liveLocationMessage) return new Response('location', { status: 200 })

  // Rate limiting — descarta mensagens recebidas em menos de RATE_LIMIT_MS após a última resposta
  const now = Date.now()
  const last = lastResponse.get(remoteJid)
  if (last && now - last < RATE_LIMIT_MS) return new Response('rate_limited', { status: 200 })

  const textRaw = (
    (msg?.conversation as string | undefined) ||
    ((msg?.extendedTextMessage as Record<string, unknown> | undefined)?.text as string | undefined) ||
    ''
  ).trim()

  // Detecta tipo de mídia (áudio, imagem, documento)
  const mediaType = msg ? detectMediaType(msg) : null

  // Se não há texto nem mídia reconhecida, ignora
  if (!textRaw && !mediaType) return new Response('no text', { status: 200 })

  // Trunca mensagens muito longas antes de qualquer processamento
  const textTruncado = textRaw.length > MAX_MSG_LENGTH ? textRaw.slice(0, MAX_MSG_LENGTH) : textRaw

  // Remove marcadores de controle internos para prevenir injeção de prompt
  const textSanitizado = textTruncado.replace(/##LEAD##|##HUMANO##/gi, '').trim()
  if (!textSanitizado && !mediaType) return new Response('no text after sanitize', { status: 200 })

  // Detecta padrões de jailbreak — loga para auditoria e bloqueia
  const isJailbreakAttempt = JAILBREAK_PATTERNS.some(p => p.test(textSanitizado))
  if (isJailbreakAttempt) {
    console.warn('[whatsapp/webhook] jailbreak attempt detected from:', remoteJid, '| msg:', textSanitizado.slice(0, 80))
    return new Response('blocked', { status: 200 }) // 200 para não revelar ao remetente que foi bloqueado
  }

  // Carrega config
  let cfg: EvolutionConfig | null = null
  let aiEnabled = false
  let aiFeature = 'whatsapp'
  let groqApiKey: string | null = null

  try {
    const row = await prisma.escritorio.findFirst({
      select: {
        evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true,
        whatsappAiEnabled: true, whatsappAiFeature: true,
        groqApiKey: true,
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
    groqApiKey = row?.groqApiKey ? (isEncrypted(row.groqApiKey as string) ? decrypt(row.groqApiKey as string) : row.groqApiKey as string) : null
  } catch (err) {
    console.error('[whatsapp/webhook] erro ao carregar config do escritório:', err)
  }

  if (!cfg) return new Response('no config', { status: 200 })

  // Verifica que a requisição veio da instância Evolution configurada
  const headerApiKey = req.headers.get('apikey')
  if (cfg.apiKey && headerApiKey !== cfg.apiKey) {
    console.warn('[whatsapp/webhook] apikey inválida recebida:', headerApiKey?.slice(0, 8))
    return new Response('unauthorized', { status: 401 })
  }

  try {
    // ── Identificação do contato ─────────────────────────────────────────────
    let cached = phoneCache.get(remoteJid)

    // Invalida cache expirado
    if (cached && Date.now() - cached.cachedAt > PHONE_CACHE_TTL_MS) {
      phoneCache.delete(remoteJid)
      cached = undefined
    }

    if (!cached) {
      const encontrado = await buscarPorTelefone(remoteJid)
      if (encontrado.socioId) {
        cached = {
          socioId:   encontrado.socioId,
          clienteId: encontrado.clienteId,
          tipo:      'socio',
          cachedAt:  Date.now(),
        }
      } else if (encontrado.clienteId) {
        cached = { clienteId: encontrado.clienteId, tipo: 'cliente', cachedAt: Date.now() }
      } else if (encontrado.leadId) {
        cached = { leadId: encontrado.leadId, tipo: 'lead', cachedAt: Date.now() }
      } else {
        cached = { tipo: 'desconhecido', cachedAt: Date.now() }
      }
      phoneCache.set(remoteJid, cached)
    }

    // ── Conversa persistida no banco ─────────────────────────────────────────
    // Sempre busca/cria a conversa ativa (inclui pausadas — fix: cache pode estar desatualizado)
    const conversaIdAtivo = await getOrCreateConversaWhatsapp(remoteJid, {
      clienteId: cached.clienteId,
      leadId:    cached.leadId,
      socioId:   cached.socioId,
    })
    // Atualiza cache se o conversaId mudou (ex: servidor reiniciou, nova sessão criada)
    if (cached.conversaId !== conversaIdAtivo) {
      cached.conversaId = conversaIdAtivo
      phoneCache.set(remoteJid, cached)
    }
    const conversaId = conversaIdAtivo

    // ── Verifica se conversa está pausada (humano assumiu o controle) ──────────
    const conversaRow = await prisma.conversaIA.findUnique({
      where: { id: conversaId },
      select: { pausadaEm: true },
    })
    if (conversaRow?.pausadaEm) {
      // Salva mensagem do cliente (aguarda — falha aqui retorna 500, Evolution fará retry)
      // Inclui whatsappMsgData para permitir re-fetch de mídia via proxy /api/whatsapp/media/[id]
      const conteudoPausado = textSanitizado || (mediaType ? `[${mediaType}]` : '[mensagem]')
      const now = new Date()
      await Promise.all([
        prisma.mensagemIA.create({
          data: {
            conversaId,
            role:            'user',
            conteudo:        conteudoPausado,
            status:          'sent',
            ...(msg && { whatsappMsgData: { key, message: msg } as object }),
          },
        }),
        prisma.conversaIA.update({
          where: { id: conversaId },
          data:  { atualizadaEm: now, ultimaMensagemEm: now },
        }),
      ])
      // Notifica o WhatsApp Drawer do CRM (humano no controle) via SSE
      emitWhatsAppRefresh(conversaId)
      // Confirmação de recebimento para o cliente (só no paused — na conversa ativa a IA responde)
      if (mediaType && cfg) {
        sendHumanLike(cfg, remoteJid, 'Documento recebido ✓ Nossa equipe irá analisar em breve.')
          .catch((err: unknown) =>
            console.error('[whatsapp/webhook] erro ao enviar confirmação de mídia (conversa pausada):', { remoteJid, err }),
          )
      }
      // Classifica e arquiva documento mesmo com humano no controle (fire-and-forget)
      if (mediaType && msg && cfg) {
        ;(async () => {
          try {
            const media = await downloadMedia(cfg, { key, message: msg! })
            if (media) {
              const isPdf = mediaType === 'document' && media.mimeType.includes('pdf')
              const textoExtraido = isPdf ? (await extractPdfText(media.buffer)) || undefined : undefined
              const base64 = (!isPdf && media.buffer) ? media.buffer.toString('base64') : undefined
              arquivarMidiaWhatsappAsync({
                media,
                base64,
                textoExtraido,
                conversaId,
                clienteId: cached.clienteId ?? undefined,
                leadId:    cached.leadId    ?? undefined,
                remoteJid,
                tipoMidia: mediaType === 'image' ? 'imagem' : 'documento',
              })
            }
          } catch (err) {
            console.error('[whatsapp/webhook] erro no arquivamento de mídia (conversa pausada):', {
              remoteJid,
              conversaId,
              err,
            })
          }
        })()
      }
      return new Response('paused', { status: 200 })
    }

    // IA desabilitada — salva a mensagem para manter histórico visível no CRM
    // Await obrigatório: fire-and-forget em serverless pode perder a operação antes do processo terminar
    if (!aiEnabled) {
      const agora = new Date()
      await Promise.all([
        prisma.mensagemIA.create({
          data: {
            conversaId,
            role:             'user',
            conteudo:         textSanitizado || (mediaType ? `[${mediaType}]` : '[mensagem]'),
            status:           'sent',
            aiProcessado:     true,
            whatsappMsgData:  { key, message: msg } as object,
          },
        }).catch((err: unknown) =>
          console.error('[whatsapp/webhook] erro ao salvar mensagem (ai disabled):', { conversaId, remoteJid, err }),
        ),
        prisma.conversaIA.update({
          where: { id: conversaId },
          data:  { atualizadaEm: agora, ultimaMensagemEm: agora },
        }).catch((err: unknown) =>
          console.error('[whatsapp/webhook] erro ao atualizar conversaIA (ai disabled):', { conversaId, remoteJid, err }),
        ),
      ])
      return new Response('ai disabled', { status: 200 })
    }

    // Carrega histórico persistido
    const historico = await getHistorico(conversaId)

    // ── Processa mídia (áudio, imagem, PDF) ──────────────────────────────────
    let textoFinal = textSanitizado
    let mediaContentParts: AIMessageContentPart[] | null = null

    if (mediaType && cfg) {
      const caption = extractMediaCaption(msg!)
      const mimeType = extractMimeType(msg!)

      if (mediaType === 'audio') {
        if (groqApiKey) {
          try {
            const media = await downloadMedia(cfg, { key, message: msg! })
            if (media) {
              const transcript = await transcribeAudio(media.buffer, media.mimeType || mimeType, groqApiKey)
              if (transcript) {
                textoFinal = transcript
                console.log('[whatsapp/webhook] áudio transcrito:', transcript.slice(0, 80))
              }
            }
          } catch (err) {
            console.error('[whatsapp/webhook] erro ao transcrever áudio:', err)
            await sendHumanLike(cfg, remoteJid, 'Desculpe, não consegui processar o áudio. Pode digitar sua mensagem?')
            prisma.mensagemIA.create({
              data: { conversaId, role: 'user', conteudo: '[áudio]', status: 'sent', whatsappMsgData: { key, message: msg } as object },
            }).catch((saveErr: unknown) =>
              console.error('[whatsapp/webhook] erro ao salvar mensagem de áudio não transcrito:', { conversaId, saveErr }),
            )
            prisma.escalacao.create({
              data: {
                canal: 'whatsapp', status: 'pendente',
                clienteId: cached.clienteId ?? null, leadId: cached.leadId ?? null,
                remoteJid, conversaIAId: conversaId,
                historico: historico as object[],
                ultimaMensagem: '[Áudio não transcrito — erro na API Groq]',
                motivoIA: `Falha na transcrição: ${(err as Error).message?.slice(0, 200)}`,
              },
            }).then(esc => {
              indexarAsync('escalacao', {
                id: esc.id, clienteId: esc.clienteId, leadId: esc.leadId,
                canal: 'whatsapp', motivoIA: esc.motivoIA, criadoEm: esc.criadoEm,
              })
            }).catch((escErr: unknown) =>
              console.error('[whatsapp/webhook] erro ao criar escalação por falha de transcrição (com key):', { conversaId, escErr }),
            )
            await prisma.conversaIA.update({ where: { id: conversaId }, data: { pausadaEm: new Date() } })
            return new Response('transcription_error', { status: 200 })
          }
        } else {
          await sendHumanLike(cfg, remoteJid, 'Recebi um áudio, mas a transcrição não está configurada. Por favor, envie sua mensagem por texto.')
          prisma.mensagemIA.create({
            data: { conversaId, role: 'user', conteudo: '[áudio]', status: 'sent', whatsappMsgData: { key, message: msg } as object },
          }).catch((saveErr: unknown) =>
            console.error('[whatsapp/webhook] erro ao salvar mensagem de áudio sem Groq key:', { conversaId, saveErr }),
          )
          prisma.escalacao.create({
            data: {
              canal: 'whatsapp', status: 'pendente',
              clienteId: cached.clienteId ?? null, leadId: cached.leadId ?? null,
              remoteJid, conversaIAId: conversaId,
              historico: historico as object[],
              ultimaMensagem: '[Áudio recebido — transcrição não configurada]',
              motivoIA: 'Groq API key não configurada',
            },
          }).then(esc => {
            indexarAsync('escalacao', {
              id: esc.id, clienteId: esc.clienteId, leadId: esc.leadId,
              canal: 'whatsapp', motivoIA: esc.motivoIA, criadoEm: esc.criadoEm,
            })
          }).catch((escErr: unknown) =>
            console.error('[whatsapp/webhook] erro ao criar escalação por áudio sem Groq key:', { conversaId, escErr }),
          )
          return new Response('no_groq_key', { status: 200 })
        }
      } else if (mediaType === 'image') {
        try {
          const media = await downloadMedia(cfg, { key, message: msg! })
          if (media) {
            const base64 = media.buffer.toString('base64')
            mediaContentParts = [
              { type: 'image', mediaType: media.mimeType, data: base64 },
              ...(caption ? [{ type: 'text' as const, text: caption }] : []),
            ]
            textoFinal = caption || '[imagem enviada]'
            // Classificar + arquivar como documento (fire-and-forget)
            arquivarMidiaWhatsappAsync({
              media,
              base64,
              conversaId,
              clienteId: cached.clienteId ?? undefined,
              leadId:    cached.leadId    ?? undefined,
              remoteJid,
              tipoMidia: 'imagem',
            })
          }
        } catch (err) {
          console.error('[whatsapp/webhook] erro ao processar imagem:', err)
        }
      } else if (mediaType === 'document') {
        try {
          const media = await downloadMedia(cfg, { key, message: msg! })
          if (media) {
            if (media.mimeType.includes('pdf')) {
              const pdfText = await extractPdfText(media.buffer)
              const fileName = media.fileName ?? 'documento'
              if (pdfText) {
                textoFinal = `[Documento recebido: ${fileName}]\n\n${pdfText.slice(0, 3000)}`
                console.log('[whatsapp/webhook] PDF extraído, chars:', pdfText.length)
              }
              // Classificar + arquivar como documento (fire-and-forget)
              arquivarMidiaWhatsappAsync({
                media,
                textoExtraido: pdfText || undefined,
                conversaId,
                clienteId: cached.clienteId ?? undefined,
                leadId:    cached.leadId    ?? undefined,
                remoteJid,
                tipoMidia: 'documento',
              })
            } else if (media.mimeType.startsWith('image/')) {
              // Documento é uma imagem (ex: foto de nota fiscal)
              const base64 = media.buffer.toString('base64')
              mediaContentParts = [
                { type: 'image', mediaType: media.mimeType, data: base64 },
                ...(caption ? [{ type: 'text' as const, text: caption }] : []),
              ]
              textoFinal = caption || '[documento/imagem enviado]'
              // Classificar + arquivar como documento (fire-and-forget)
              arquivarMidiaWhatsappAsync({
                media,
                base64,
                conversaId,
                clienteId: cached.clienteId ?? undefined,
                leadId:    cached.leadId    ?? undefined,
                remoteJid,
                tipoMidia: 'documento',
              })
            }
          }
        } catch (err) {
          console.error('[whatsapp/webhook] erro ao processar documento:', err)
        }
      }
    }

    // Se havia mídia mas não conseguiu baixar/processar: salva como placeholder
    // O cron fará retry do download. Só rejeita se não há mídia E não há texto.
    if (!textoFinal && !mediaContentParts) {
      if (mediaType) {
        textoFinal = `[${mediaType}]`
      } else {
        await sendHumanLike(cfg, remoteJid, 'Desculpe, não consegui processar essa mensagem. Pode enviar por texto?')
        return new Response('no_content', { status: 200 })
      }
    }

    // ── Salva mensagem como pendente (debounce) ───────────────────────────────
    // O processamento real ocorre em /api/whatsapp/processar-pendentes (cron ~5s)
    await prisma.mensagemIA.create({
      data: {
        conversaId,
        role:         'user',
        conteudo:     textoFinal || '[mídia]',
        status:       'pending',
        aiProcessado: false,
        whatsappMsgData: {
          key,
          message:           msg,
          mediaContentParts: mediaContentParts ?? null,
          remoteJid,
          clienteId:         cached.clienteId ?? null,
          leadId:            cached.leadId    ?? null,
          tipo:              cached.tipo,
        } as object,
      },
    })

    // Atualiza ultimaMensagemEm — o debounce usa este campo para saber quando o cliente parou de digitar
    await prisma.conversaIA.update({
      where: { id: conversaId },
      data:  { ultimaMensagemEm: new Date() },
    })
    // Notifica o WhatsApp Drawer do CRM via SSE (após salvar no DB)
    emitWhatsAppRefresh(conversaId)
    lastResponse.set(remoteJid, Date.now())
  } catch (err) {
    console.error('[whatsapp/webhook] erro:', err)
  }

  return new Response('ok', { status: 200 })
}

export async function GET() {
  return new Response('ok', { status: 200 })
}

// ─── Arquivamento de mídia WhatsApp ──────────────────────────────────────────

type ArquivarMidiaInput = {
  media:          { buffer: Buffer; mimeType: string; fileName?: string }
  tipoMidia:      'imagem' | 'documento'
  conversaId:     string
  clienteId?:     string
  leadId?:        string
  remoteJid:      string
  base64?:        string   // já calculado (evita re-encode)
  textoExtraido?: string   // já extraído (PDF)
}

/**
 * Classifica a mídia com contexto da conversa e, se for um documento formal,
 * salva via criarDocumento() (que dispara resumo + RAG automaticamente).
 * Totalmente fire-and-forget — nunca bloqueia o webhook.
 */
function arquivarMidiaWhatsappAsync(input: ArquivarMidiaInput): void {
  if (!input.clienteId && !input.leadId) return  // sem vínculo, nada a fazer

  const tipoLabel = input.tipoMidia === 'imagem' ? 'WhatsApp — Imagem' : 'WhatsApp — Documento'

  // Busca empresaId do cliente para que o documento apareça também na ficha da empresa
  const getEmpresaId = input.clienteId
    ? prisma.cliente.findUnique({ where: { id: input.clienteId }, select: { empresaId: true } })
        .then(c => c?.empresaId ?? undefined)
        .catch(() => undefined)
    : Promise.resolve(undefined)

  Promise.all([buildContextoConversa(input.conversaId, 5), getEmpresaId])
    .then(async ([contexto, empresaId]) => {
      let deveArquivar: boolean
      try {
        deveArquivar = await classificarDocumento({
          arquivo: {
            nome:          input.media.fileName ?? 'arquivo',
            mimeType:      input.media.mimeType,
            buffer:        input.base64 ? undefined : input.media.buffer,
            base64:        input.base64,
            textoExtraido: input.textoExtraido,
          },
          contexto,
        })
      } catch (err) {
        // IA de classificação falhou — salva com status pendente para revisão/retry
        console.error('[webhook] falha na classificação de documento via IA:', { remoteJid: input.remoteJid, err })
        return criarDocumento({
          clienteId: input.clienteId,
          leadId:    input.leadId,
          empresaId,
          arquivo: {
            buffer:   input.media.buffer,
            nome:     input.media.fileName ?? 'arquivo',
            mimeType: input.media.mimeType,
          },
          tipo:        tipoLabel,
          status:      'pendente',
          origem:      'whatsapp',
          resumoStatus: 'pendente',
          metadados:   { fonte: 'whatsapp', remoteJid: input.remoteJid, classificacaoFalhou: true },
        })
      }

      if (!deveArquivar) return

      return criarDocumento({
        clienteId: input.clienteId,
        leadId:    input.leadId,
        empresaId,
        arquivo: {
          buffer:   input.media.buffer,
          nome:     input.media.fileName ?? 'arquivo',
          mimeType: input.media.mimeType,
        },
        tipo:   tipoLabel,
        status: 'recebido',
        origem: 'whatsapp',
        metadados: { fonte: 'whatsapp', remoteJid: input.remoteJid },
      })
    })
    .catch(err => console.error('[whatsapp/webhook] arquivarMidia error:', err))
}
