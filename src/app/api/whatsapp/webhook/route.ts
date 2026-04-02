import { prisma }                              from '@/lib/prisma'
import { emitWhatsAppRefresh }                 from '@/lib/event-bus'
import { decrypt, isEncrypted }               from '@/lib/crypto'
import type { EvolutionConfig }               from '@/lib/evolution'
import * as Sentry                            from '@sentry/nextjs'
import { getOrCreateConversaWhatsapp, getHistorico } from '@/lib/ai/conversa'
import { sendHumanLike }                      from '@/lib/whatsapp/human-like'
import { downloadMedia, downloadMediaDirect, detectMediaType, extractMediaCaption, extractMimeType, extractPdfText } from '@/lib/whatsapp/media'
import { transcribeAudio }                    from '@/lib/ai/transcribe'
import type { AIMessageContentPart }          from '@/lib/ai/providers/types'
import { indexarAsync }                       from '@/lib/rag/indexar-async'
import { RATE_LIMIT_MS, MAX_MSG_LENGTH, PHONE_CACHE_TTL_MS, JAILBREAK_PATTERNS } from '@/lib/whatsapp/constants'
import { buscarPorTelefone }                  from '@/lib/whatsapp/identificar-contato'
import { arquivarMidiaWhatsappAsync }         from '@/lib/whatsapp/arquivar-midia'
// Garante que todas as tools estejam registradas
import '@/lib/ai/tools'

export const runtime = 'nodejs'

// Cache de mensagens já processadas (reinicia com o servidor)
const processed = new Set<string>()

// Rate limiting: timestamp da última resposta enviada por número
const lastResponse = new Map<string, number>()
const phoneCache = new Map<string, {
  clienteId?: string
  leadId?: string
  socioId?: string
  tipo: 'cliente' | 'lead' | 'socio' | 'prospect' | 'desconhecido'
  conversaId?: string
  cachedAt: number
}>()



export async function POST(req: Request) {
  // Verificação estática antecipada — rejeita antes de qualquer acesso ao banco
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET
  if (WEBHOOK_SECRET) {
    const headerApiKey = req.headers.get('apikey')
    if (headerApiKey !== WEBHOOK_SECRET) {
      Sentry.captureMessage('Webhook WhatsApp rejeitado: WEBHOOK_SECRET inválido', {
        level: 'warning',
        tags:  { module: 'whatsapp-webhook', operation: 'auth-secret' },
        extra: { receivedPrefix: headerApiKey?.slice(0, 6) ?? 'ausente' },
      })
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

  // Stickers/GIFs — ignora silenciosamente (reação visual, não requer resposta da IA)
  if (mediaType === 'sticker') return new Response('sticker_ignored', { status: 200 })

  // Se não há texto nem mídia reconhecida, ignora
  if (!textRaw && !mediaType) return new Response('no text', { status: 200 })

  // Trunca mensagens muito longas — loga no Sentry para acompanhamento de frequência
  const textTruncado = textRaw.length > MAX_MSG_LENGTH ? textRaw.slice(0, MAX_MSG_LENGTH) : textRaw
  if (textRaw.length > MAX_MSG_LENGTH) {
    console.warn('[whatsapp/webhook] mensagem truncada:', { remoteJid, originalLength: textRaw.length, maxLength: MAX_MSG_LENGTH })
    Sentry.captureMessage('Mensagem WhatsApp truncada por exceder limite', {
      level: 'warning',
      tags:  { module: 'whatsapp-webhook', operation: 'truncar-mensagem' },
      extra: { remoteJid, originalLength: textRaw.length, maxLength: MAX_MSG_LENGTH },
    })
  }

  // Remove marcadores de controle internos para prevenir injeção de prompt
  const textSanitizado = textTruncado.replace(/##LEAD##|##HUMANO##/gi, '').trim()
  if (!textSanitizado && !mediaType) return new Response('no text after sanitize', { status: 200 })

  // Detecta padrões de jailbreak — loga para auditoria, captura no Sentry e bloqueia
  const isJailbreakAttempt = JAILBREAK_PATTERNS.some(p => p.test(textSanitizado))
  if (isJailbreakAttempt) {
    console.warn('[whatsapp/webhook] jailbreak attempt detected from:', remoteJid, '| msg:', textSanitizado.slice(0, 80))
    Sentry.captureMessage('Tentativa de jailbreak bloqueada via WhatsApp', {
      level: 'warning',
      tags:  { module: 'whatsapp-webhook', operation: 'jailbreak-block' },
      extra: { remoteJid, snippet: textSanitizado.slice(0, 120) },
    })
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
    Sentry.captureMessage('Webhook WhatsApp rejeitado: apikey da Evolution inválida', {
      level: 'warning',
      tags:  { module: 'whatsapp-webhook', operation: 'auth-evolution' },
      extra: { receivedPrefix: headerApiKey?.slice(0, 6) ?? 'ausente' },
    })
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
      const [mensagemPausada] = await Promise.all([
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
      // Classifica, arquiva e persiste buffer (fire-and-forget)
      if (mediaType && msg && cfg) {
        ;(async () => {
          try {
            const media = await downloadMedia(cfg, { key, message: msg! })
            if (media) {
              // Persiste buffer na mensagem para o proxy servir sem re-fetch da Evolution
              await prisma.mensagemIA.update({
                where: { id: mensagemPausada.id },
                data: {
                  mediaBuffer:   media.buffer as unknown as Uint8Array<ArrayBuffer>,
                  mediaMimeType: media.mimeType,
                  mediaFileName: media.fileName ?? null,
                  mediaType:     mediaType === 'image' ? 'image' : 'document',
                },
              }).catch((err: unknown) =>
                console.error('[whatsapp/webhook] erro ao salvar buffer de mídia pausada:', { conversaId, err }),
              )
              const isPdf = mediaType === 'document' && media.mimeType.includes('pdf')
              const textoExtraido = isPdf
                ? (await Promise.race<string | null>([
                    extractPdfText(media.buffer),
                    new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
                  ])) || undefined
                : undefined
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
    let savedMediaBuffer: Buffer | null = null
    let savedMediaMimeType: string | null = null
    let savedMediaFileName: string | null = null

    if (mediaType && cfg) {
      const caption = extractMediaCaption(msg!)
      const mimeType = extractMimeType(msg!)

      if (mediaType === 'audio') {
        if (groqApiKey) {
          try {
            // Tenta Evolution API; fallback para CDN direto (cobre addressingMode: 'lid')
            const media = await downloadMedia(cfg, { key, message: msg! })
              ?? await downloadMediaDirect(msg as Record<string, unknown>)
            if (media) {
              const transcript = await transcribeAudio(media.buffer, media.mimeType || mimeType, groqApiKey)
              if (transcript) {
                textoFinal = transcript
                console.log('[whatsapp/webhook] áudio transcrito:', transcript.slice(0, 80))
              } else {
                // Groq retornou vazio sem exceção (áudio ininteligível, silêncio, etc.)
                console.warn('[whatsapp/webhook] transcrição retornou vazio para áudio:', remoteJid)
                Sentry.captureMessage('Groq Whisper retornou transcrição vazia', {
                  level: 'warning',
                  tags:  { module: 'whatsapp-webhook', operation: 'transcricao-audio' },
                  extra: { remoteJid, conversaId, mimeType },
                })
                await sendHumanLike(cfg, remoteJid, 'Não consegui entender seu áudio. Pode enviar por texto?')
                return new Response('transcript_empty', { status: 200 })
              }
            } else {
              // Ambos os métodos de download falharam — informa o cliente imediatamente
              console.warn('[whatsapp/webhook] download de áudio falhou (Evolution + CDN):', remoteJid)
              Sentry.captureMessage('Download de áudio falhou — Evolution e CDN retornaram null', {
                level: 'error',
                tags:  { module: 'whatsapp-webhook', operation: 'download-audio' },
                extra: { remoteJid, conversaId },
              })
              await sendHumanLike(cfg, remoteJid, 'Não consegui ouvir seu áudio. Pode enviar por texto?')
              return new Response('audio_download_null', { status: 200 })
            }
          } catch (err) {
            console.error('[whatsapp/webhook] erro ao transcrever áudio:', err)
            Sentry.captureException(err, {
              tags:  { module: 'whatsapp-webhook', operation: 'transcricao-audio' },
              extra: { remoteJid, conversaId, mimeType },
            })
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
            ?? await downloadMediaDirect(msg as Record<string, unknown>)
          if (media) {
            const base64 = media.buffer.toString('base64')
            mediaContentParts = [
              { type: 'image', mediaType: media.mimeType, data: base64 },
              ...(caption ? [{ type: 'text' as const, text: caption }] : []),
            ]
            textoFinal = caption || '[imagem enviada]'
            savedMediaBuffer   = media.buffer
            savedMediaMimeType = media.mimeType
            savedMediaFileName = media.fileName ?? null
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
            ?? await downloadMediaDirect(msg as Record<string, unknown>)
          if (media) {
            savedMediaBuffer   = media.buffer
            savedMediaMimeType = media.mimeType
            savedMediaFileName = media.fileName ?? null
            if (media.mimeType.includes('pdf')) {
              const pdfText = await Promise.race<string | null>([
                extractPdfText(media.buffer),
                new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
              ])
              const fileName = media.fileName ?? 'documento'
              // Salva apenas o label — texto do PDF vai para a IA via systemExtra (processar-pendentes)
              // Nunca concatenar no conteudo: quebra a detecção de hasWhatsappMedia no CRM
              textoFinal = `[Documento recebido: ${fileName}]`
              if (pdfText) {
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
        ...(savedMediaBuffer && {
          mediaBuffer:   savedMediaBuffer as unknown as Uint8Array<ArrayBuffer>,
          mediaMimeType: savedMediaMimeType ?? undefined,
          mediaFileName: savedMediaFileName ?? undefined,
          mediaType:     mediaType === 'image' ? 'image' : 'document',
        }),
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
    Sentry.captureException(err, { tags: { module: 'whatsapp-webhook' } })
  }

  return new Response('ok', { status: 200 })
}

export async function GET() {
  return new Response('ok', { status: 200 })
}

