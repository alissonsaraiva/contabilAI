/**
 * Processador de mensagens WhatsApp pendentes (debounce).
 *
 * Fluxo:
 *   1. Webhook salva mensagem com aiProcessado=false
 *   2. Este módulo é chamado pelo cron a cada ~4s
 *   3. Busca conversas com msgs pendentes onde a última chegou há >5s
 *   4. Agrupa mensagens por conversa e chama a IA uma vez só
 *
 * Chamado em: /api/whatsapp/processar-pendentes
 */

import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'
import type { EvolutionConfig } from '@/lib/evolution'
import { askAI } from '@/lib/ai/ask'
import { getHistorico } from '@/lib/ai/conversa'
import { downloadMedia, downloadMediaDirect, extractPdfText } from '@/lib/whatsapp/media'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { sendHumanLike } from '@/lib/whatsapp/human-like'
import type { AIMessageContentPart } from '@/lib/ai/providers/types'
import { retomarPausadas } from '@/lib/whatsapp/pipeline/retomar-pausadas'
import { buildSystemExtra } from '@/lib/whatsapp/pipeline/contexto'
import { processarRespostaIA } from '@/lib/whatsapp/pipeline/enviar-resposta'

const DEBOUNCE_MS  = 30000  // aguarda 30s após última mensagem antes de processar (contexto completo)
const LOCK_TIMEOUT = 30000  // considera lock expirado após 30s (proteção contra crash sem finally)
const PDF_TIMEOUT  = 5000   // timeout para extração de texto de PDF (evita travar o cron)

export async function processarMensagensPendentes(): Promise<{
  conversasProcessadas: number
  erros: string[]
}> {
  const cutoff = new Date(Date.now() - DEBOUNCE_MS)

  // Stage 1: Auto-resume de conversas pausadas há mais de 1h sem nova atividade humana
  await retomarPausadas()

  // Busca conversas WhatsApp com mensagens não processadas cuja última msg chegou há >5s
  const conversas = await prisma.conversaIA.findMany({
    where: {
      canal:           'whatsapp',
      pausadaEm:       null,
      ultimaMensagemEm: { lt: cutoff },
      mensagens: {
        some: { role: 'user', aiProcessado: false },
      },
    },
    select: {
      id:              true,
      remoteJid:       true,
      clienteId:       true,
      leadId:          true,
      socioId:         true,
      ultimaMensagemEm: true,
    },
    take: 10, // processa no máximo 10 conversas por invocação
  })

  if (conversas.length === 0) return { conversasProcessadas: 0, erros: [] }

  // Carrega config Evolution uma vez só
  const row = await prisma.escritorio.findFirst({
    select: {
      evolutionApiUrl:  true,
      evolutionApiKey:  true,
      evolutionInstance: true,
      whatsappAiEnabled: true,
      whatsappAiFeature: true,
      spedyApiKey:       true,
    },
  })

  if (!row?.evolutionApiUrl || !row.evolutionApiKey || !row.evolutionInstance || !row.whatsappAiEnabled) {
    return { conversasProcessadas: 0, erros: ['WhatsApp ou IA desabilitado'] }
  }

  const rawKey = row.evolutionApiKey
  const cfg: EvolutionConfig = {
    baseUrl:  row.evolutionApiUrl,
    apiKey:   isEncrypted(rawKey) ? decrypt(rawKey) : rawKey,
    instance: row.evolutionInstance,
  }
  const aiFeature = row.whatsappAiFeature ?? 'whatsapp'

  let conversasProcessadas = 0
  const erros: string[] = []

  for (const conversa of conversas) {
    // Lock distribuído via banco — atomic UPDATE evita duplo processamento entre instâncias Docker
    // Considera o lock expirado se processandoEm está há mais de LOCK_TIMEOUT ms (proteção contra crash)
    const lockExpiry = new Date(Date.now() - LOCK_TIMEOUT)
    const lockAcquired = await prisma.conversaIA.updateMany({
      where: {
        id: conversa.id,
        OR: [{ processandoEm: null }, { processandoEm: { lt: lockExpiry } }],
      },
      data: { processandoEm: new Date() },
    })
    if (lockAcquired.count === 0) continue // Outra instância está processando esta conversa

    try {
      // Busca todas as mensagens não processadas desta conversa
      const msgs = await prisma.mensagemIA.findMany({
        where:   { conversaId: conversa.id, role: 'user', aiProcessado: false },
        orderBy: { criadaEm: 'asc' },
      })

      if (msgs.length === 0) continue

      // Agrega textos e pega o último mediaContent disponível
      // Tenta re-baixar documentos/imagens que chegaram como placeholder [document]/[image]
      // (webhook salva placeholder quando a Evolution API está lenta no momento do recebimento)
      let mediaContentParts: AIMessageContentPart[] | null = null
      const textos: string[] = []
      let textoExtraidoPdf: string | null = null  // texto do PDF — só para a IA, não para exibição
      let pdfSemTexto = false  // true quando havia buffer de PDF mas extração falhou/timeout

      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i]
        const data = m.whatsappMsgData as Record<string, unknown> | null

        if (data?.mediaContentParts) {
          if (!mediaContentParts) mediaContentParts = data.mediaContentParts as AIMessageContentPart[]
        }

        // Tenta retry de download para placeholders de documento
        // Extrai apenas { key, message } — campos extras quebram o getBase64FromMediaMessage da Evolution API
        if (m.conteudo === '[document]' && data && !mediaContentParts) {
          try {
            // Tenta Evolution API primeiro; fallback para download direto do CDN (fix addressingMode: 'lid')
            const mediaViaApi = await downloadMedia(cfg, { key: data.key, message: data.message })
            const media = mediaViaApi ?? (
              data.message
                ? await downloadMediaDirect(data.message as Record<string, unknown>)
                : null
            )
            if (media) {
              // Persiste buffer independente de extração — garante que o proxy sirva sem re-fetch
              const updateData: Record<string, unknown> = {
                mediaBuffer:   media.buffer,
                mediaMimeType: media.mimeType,
                mediaFileName: media.fileName ?? null,
                mediaType:     'document',
              }
              if (media.mimeType.includes('pdf')) {
                // Timeout de 5s: PDF malformado ou muito grande pode travar o cron inteiro
                const pdfText = await Promise.race<string | null>([
                  extractPdfText(media.buffer),
                  new Promise<null>(resolve => setTimeout(() => resolve(null), PDF_TIMEOUT)),
                ])
                if (pdfText) {
                  // Armazena só o label curto como conteudo (visível no CRM)
                  // O texto extraído vai para a IA via systemExtra — não para a conversa
                  const textoLabel = `[Documento recebido: ${media.fileName ?? 'arquivo'}]`
                  updateData.conteudo = textoLabel
                  await prisma.mensagemIA.update({ where: { id: m.id }, data: updateData })
                  textos.unshift(textoLabel)
                  textoExtraidoPdf = pdfText.slice(0, 3000)
                  continue
                }
              }
              await prisma.mensagemIA.update({ where: { id: m.id }, data: updateData }).catch(() => null)
            }
          } catch (err: unknown) {
            // retry de download falhou — mantém placeholder [document] visível no CRM para o operador
            console.error('[processar-pendentes] retry de download de mídia falhou, mantendo placeholder:', { conversaId: conversa.id, mensagemId: m.id, err })
            Sentry.captureException(err, { tags: { module: 'processar-pendentes', operation: 'retry-download-midia' }, extra: { conversaId: conversa.id, mensagemId: m.id } })
          }
        }

        // Extrai texto de PDFs com buffer presente mas conteudo apenas com label
        // (webhook path normal: media baixada com sucesso, texto não foi concatenado no conteudo)
        if (!textoExtraidoPdf && m.mediaBuffer && m.mediaMimeType?.includes('pdf')) {
          try {
            // Timeout de 5s: PDF malformado ou muito grande pode travar o cron inteiro
            const pdfText = await Promise.race<string | null>([
              extractPdfText(Buffer.from(m.mediaBuffer as Buffer)),
              new Promise<null>(resolve => setTimeout(() => resolve(null), PDF_TIMEOUT)),
            ])
            if (pdfText) {
              textoExtraidoPdf = pdfText.slice(0, 3000)
            } else {
              // Timeout ou PDF sem texto — marca para injetar aviso no systemExtra
              pdfSemTexto = true
              console.warn('[processar-pendentes] extração de PDF retornou null (timeout ou sem texto):', { conversaId: conversa.id, mensagemId: m.id })
            }
          } catch (err: unknown) {
            pdfSemTexto = true
            console.error('[processar-pendentes] erro ao extrair texto do PDF:', { conversaId: conversa.id, mensagemId: m.id, err })
            Sentry.captureException(err, { tags: { module: 'processar-pendentes', operation: 'extrair-pdf' }, extra: { conversaId: conversa.id, mensagemId: m.id } })
          }
        }

        // Filtra placeholders de áudio que falharam no download — não passar literal à IA
        if (m.conteudo && m.conteudo !== '[áudio]' && m.conteudo !== '[audio]') textos.unshift(m.conteudo)
      }

      const textoAgregado = textos.join('\n')

      if (!textoAgregado && !mediaContentParts) continue

      // [document] com texto acompanhante: strip do placeholder para não passar literal à IA
      const temDocumentoFalho = textoAgregado.includes('[document]') && !mediaContentParts
      const textoParaIA = temDocumentoFalho
        ? textoAgregado.replace(/\[document\]\n?|\n?\[document\]/g, '').trim()
        : textoAgregado

      // Áudio que falhou no download: não chamar a IA (responderia com base no contexto anterior).
      // Envia mensagem canned pedindo que envie por texto.
      if (textoAgregado === '[audio]' && !mediaContentParts) {
        // Alerta Sentry — placeholder chegou no cron; regressão no webhook
        Sentry.captureMessage('Placeholder [audio] chegou no cron — download falhou silenciosamente', {
          level: 'warning',
          tags:  { module: 'processar-pendentes', operation: 'audio-placeholder' },
          extra: { conversaId: conversa.id, remoteJid: conversa.remoteJid },
        })
        const cannedAudio = 'Não consegui ouvir seu áudio. Pode enviar sua mensagem por texto?'
        try {
          await sendHumanLike(cfg, conversa.remoteJid ?? '', cannedAudio)
          await prisma.mensagemIA.create({
            data: { conversaId: conversa.id, role: 'assistant', conteudo: cannedAudio, status: 'sent' },
          })
          await prisma.mensagemIA.updateMany({
            where:  { conversaId: conversa.id, status: 'pending' },
            data:   { status: 'sent', aiProcessado: true },
          })
        } catch (err) {
          console.error('[processar-pendentes] erro ao enviar canned response de áudio falho:', { conversaId: conversa.id, err })
          Sentry.captureException(err, { tags: { module: 'processar-pendentes', operation: 'canned-audio' }, extra: { conversaId: conversa.id } })
        }
        continue
      }

      // Documento sem conteúdo extraível: não chamar a IA (responderia bobagem).
      // Envia mensagem canned ao cliente e cria escalação para revisão humana.
      if (textoAgregado === '[document]' && !mediaContentParts) {
        const cannedResponse = 'Recebi seu documento! Nossa equipe irá analisá-lo em breve e retornará em contato.'
        try {
          await sendHumanLike(cfg, conversa.remoteJid ?? '', cannedResponse)
          await prisma.mensagemIA.create({
            data: {
              conversaId:   conversa.id,
              role:         'assistant',
              conteudo:     cannedResponse,
              status:       'sent',
              aiProcessado: true,
            },
          }).catch((err: unknown) => {
            console.error('[processar-pendentes] erro ao salvar canned response no DB:', { conversaId: conversa.id, err })
            Sentry.captureException(err, { tags: { module: 'processar-pendentes', operation: 'salvar-canned-response' }, extra: { conversaId: conversa.id } })
          })
          const historico = await getHistorico(conversa.id)
          // Verifica se já existe escalação aberta para esta conversa
          const escalacaoExistente = await prisma.escalacao.findFirst({
            where: { conversaIAId: conversa.id, status: { in: ['pendente', 'em_atendimento'] } },
            select: { id: true, historico: true, motivoIA: true },
          })
          if (escalacaoExistente) {
            // Atualiza escalação existente com novo histórico e motivo adicional
            const novoMotivo = [
              escalacaoExistente.motivoIA,
              `Nova tentativa de envio de documento falhou (${new Date().toLocaleString('pt-BR')})`,
            ].filter(Boolean).join(' | ')
            await prisma.escalacao.update({
              where: { id: escalacaoExistente.id },
              data: {
                historico:      historico as object[],
                ultimaMensagem: '[Documento recebido — não foi possível processar automaticamente]',
                motivoIA:       novoMotivo,
              },
            }).catch((err: unknown) => {
              console.error('[processar-pendentes] erro ao atualizar escalação existente:', { conversaId: conversa.id, err })
              Sentry.captureException(err, { tags: { module: 'processar-pendentes', operation: 'atualizar-escalacao-existente' }, extra: { conversaId: conversa.id } })
            })
          } else {
            await prisma.escalacao.create({
              data: {
                canal:          'whatsapp',
                status:         'pendente',
                clienteId:      conversa.clienteId ?? null,
                leadId:         conversa.leadId    ?? null,
                remoteJid:      conversa.remoteJid ?? '',
                conversaIAId:   conversa.id,
                historico:      historico as object[],
                ultimaMensagem: '[Documento recebido — não foi possível processar automaticamente]',
                motivoIA:       'Falha no download do documento via Evolution API após retry no cron',
              },
            }).then(esc => {
              indexarAsync('escalacao', {
                id: esc.id, clienteId: esc.clienteId, leadId: esc.leadId,
                canal: 'whatsapp', motivoIA: esc.motivoIA, criadoEm: esc.criadoEm,
              })
            }).catch((err: unknown) => {
              console.error('[processar-pendentes] erro ao indexar escalação por documento não processado:', { conversaId: conversa.id, err })
              Sentry.captureException(err, { tags: { module: 'processar-pendentes', operation: 'indexar-escalacao-documento' }, extra: { conversaId: conversa.id } })
            })
          }
          await prisma.conversaIA.update({
            where: { id: conversa.id },
            data:  { pausadaEm: new Date() },
          })
        } catch (err) {
          console.error('[processar-pendentes] erro ao escalar documento não processado:', { conversaId: conversa.id, err })
          Sentry.captureException(err, { tags: { module: 'processar-pendentes', operation: 'escalar-documento' }, extra: { conversaId: conversa.id } })
        }
        // Marca as mensagens como processadas SEM deletar — preserva o [document] visível na conversa
        // (o usuário humano ainda pode clicar e tentar baixar via proxy)
        await prisma.mensagemIA.updateMany({
          where: { id: { in: msgs.map(m => m.id) } },
          data:  { aiProcessado: true, status: 'sent' },
        }).catch((err: unknown) => {
          console.error('[processar-pendentes] erro ao marcar msgs de documento como processadas:', { conversaId: conversa.id, err })
          Sentry.captureException(err, { tags: { module: 'processar-pendentes', operation: 'marcar-msgs-documento-processadas' }, extra: { conversaId: conversa.id } })
        })
        conversasProcessadas++
        continue
      }

      // ── Escalação aberta: não processar com IA — só atualizar histórico ──────
      // Se há escalação pendente/em_atendimento, a conversa deve permanecer com humano.
      // Atualiza o histórico da escalação e pausa, sem chamar a IA.
      const escalacaoAbertaNormal = await prisma.escalacao.findFirst({
        where: { conversaIAId: conversa.id, status: { in: ['pendente', 'em_atendimento'] } },
        select: { id: true, historico: true, motivoIA: true },
      })
      if (escalacaoAbertaNormal) {
        const historicoAtual = await getHistorico(conversa.id)
        const novoMotivo = textoParaIA
          ? [escalacaoAbertaNormal.motivoIA, `Nova mensagem (${new Date().toLocaleString('pt-BR')}): "${textoParaIA.slice(0, 100)}"`].filter(Boolean).join(' | ')
          : escalacaoAbertaNormal.motivoIA
        await prisma.escalacao.update({
          where: { id: escalacaoAbertaNormal.id },
          data: {
            historico:      historicoAtual as object[],
            ultimaMensagem: textoParaIA.slice(0, 500) || '[mídia enviada]',
            motivoIA:       novoMotivo ?? undefined,
          },
        }).catch((err: unknown) => {
          console.error('[processar-pendentes] erro ao atualizar histórico de escalação aberta:', { conversaId: conversa.id, err })
          Sentry.captureException(err, { tags: { module: 'processar-pendentes', operation: 'atualizar-historico-escalacao' }, extra: { conversaId: conversa.id } })
        })
        // Garante que a conversa permanece pausada — falha silenciosa aceitável (escalação já criada)
        await prisma.conversaIA.update({
          where: { id: conversa.id },
          data:  { pausadaEm: new Date() },
        }).catch(() => null)
        await prisma.mensagemIA.updateMany({
          where: { id: { in: msgs.map(m => m.id) } },
          data:  { aiProcessado: true },
        }).catch((err: unknown) => {
          console.error('[processar-pendentes] erro ao marcar msgs como processadas (escalação aberta):', { conversaId: conversa.id, err })
          Sentry.captureException(err, { tags: { module: 'processar-pendentes', operation: 'marcar-msgs-processadas-escalacao' }, extra: { conversaId: conversa.id } })
        })
        conversasProcessadas++
        continue
      }

      // Stage 3: Constrói systemExtra + context + historico via pipeline/contexto
      const { systemExtra, context, historico, documentoClassificado } = await buildSystemExtra({
        conversa:          { id: conversa.id, clienteId: conversa.clienteId, leadId: conversa.leadId, socioId: conversa.socioId, remoteJid: conversa.remoteJid },
        spedyApiKey:       row.spedyApiKey ?? null,
        aiFeature,
        textoAgregado,
        textoParaIA,
        temDocumentoFalho,
        pdfSemTexto,
        textoExtraidoPdf,
        mediaContentParts,
      })

      // Chama IA
      // Quando o documento foi classificado com sucesso, omite mediaContentParts e
      // textoExtraidoPdf do askAI principal — o modelo não precisa ver o conteúdo
      // bruto e a ausência dele elimina a tendência de sumarizar para o cliente.
      const result = await askAI({
        pergunta:     textoParaIA || '[mídia enviada]',
        context,
        feature:      aiFeature as 'whatsapp',
        historico,
        systemExtra,
        maxTokens:    512,
        mediaContent: documentoClassificado ? undefined : (mediaContentParts ?? undefined),
      })

      // Stage 4: Processa e envia a resposta ao cliente
      await processarRespostaIA({
        conversa:      { id: conversa.id, clienteId: conversa.clienteId, leadId: conversa.leadId, remoteJid: conversa.remoteJid },
        respostaRaw:   result.resposta,
        historico,
        textoParaIA,
        textoAgregado,
        cfg,
        msgs,
      })

      conversasProcessadas++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      erros.push(`conversa ${conversa.id}: ${msg}`)
      console.error('[processar-pendentes] erro:', conversa.id, msg)
      Sentry.captureException(err, {
        tags: { module: 'processar-pendentes', canal: 'whatsapp' },
        extra: { conversaId: conversa.id },
      })
    } finally {
      // Libera o lock distribuído — obrigatório mesmo em caso de erro para não bloquear a conversa
      await prisma.conversaIA.update({
        where: { id: conversa.id },
        data:  { processandoEm: null },
      }).catch((err: unknown) => {
        console.error('[processar-pendentes] CRÍTICO: falha ao liberar lock de processamento:', { conversaId: conversa.id, err })
        Sentry.captureException(err, { tags: { module: 'processar-pendentes', operation: 'liberar-lock' }, extra: { conversaId: conversa.id } })
      })
    }
  }

  return { conversasProcessadas, erros }
}
