/**
 * Processador assíncrono de envios de broadcast (listas de transmissão).
 *
 * Chamado pelo cron da VPS a cada ~1min.
 *
 * Para cada envio em status "processando":
 *   1. Busca destinatários pendentes OU falhos com tentativas < MAX_TENTATIVAS
 *   2. Resolve config Evolution API
 *   3. Para cada destinatário:
 *     a. Busca/cria ConversaIA (WhatsApp) individual
 *     b. Envia via Evolution (sendText ou sendMedia)
 *     c. Cria MensagemIA na conversa individual (para IA ter contexto)
 *     d. Emite SSE refresh
 *     e. Atualiza status do destinatário
 *     f. Delay entre mensagens (anti-ban)
 *   4. Atualiza contadores do envio
 *
 * Retry: destinatários que falham são retentados até 3x pelo cron.
 * Na 3ª falha, ficam como "falhou" definitivamente.
 */

import { prisma } from '@/lib/prisma'
import { sendText, sendMedia } from '@/lib/evolution'
import type { MediaType } from '@/lib/evolution'
import { getEvolutionConfig, resolveMediaUrl } from '@/lib/whatsapp-utils'
import { emitWhatsAppRefresh } from '@/lib/event-bus'
import * as Sentry from '@sentry/nextjs'

/** Delay entre envios para cada destinatário (ms) — anti-ban WhatsApp */
const DELAY_ENTRE_ENVIOS_MS = 3_000

/** Máximo de envios processados por execução do cron */
const MAX_ENVIOS_POR_EXECUCAO = 3

/** Máximo de tentativas por destinatário antes de desistir */
const MAX_TENTATIVAS = 3

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export async function processarEnviosPendentes(): Promise<{
  enviosProcessados: number
  totalEnviados: number
  totalFalhas: number
  totalRetries: number
}> {
  let totalEnviados = 0
  let totalFalhas = 0
  let totalRetries = 0

  // Busca envios em processamento (FIFO)
  const envios = await prisma.envioTransmissao.findMany({
    where: { status: 'processando' },
    orderBy: { criadoEm: 'asc' },
    take: MAX_ENVIOS_POR_EXECUCAO,
    include: {
      destinatarios: {
        where: {
          OR: [
            { status: 'pendente' },
            // Retry: falhos com menos de MAX_TENTATIVAS
            { status: 'falhou', tentativas: { lt: MAX_TENTATIVAS } },
          ],
        },
        take: 20,
      },
    },
  })

  if (envios.length === 0) return { enviosProcessados: 0, totalEnviados: 0, totalFalhas: 0, totalRetries: 0 }

  const cfg = await getEvolutionConfig()
  if (!cfg) {
    console.warn('[broadcast] Evolution API não configurada — abortando processamento')
    return { enviosProcessados: 0, totalEnviados: 0, totalFalhas: 0, totalRetries: 0 }
  }

  for (const envio of envios) {
    if (envio.destinatarios.length === 0) {
      await finalizarEnvio(envio.id)
      continue
    }

    // Resolver URL de mídia assinada (se houver)
    let mediaUrlResolvida: string | null = null
    if (envio.mediaUrl) {
      mediaUrlResolvida = await resolveMediaUrl(envio.mediaUrl, `broadcast:${envio.id}`)
    }

    for (const dest of envio.destinatarios) {
      const isRetry = dest.status === 'falhou'
      if (isRetry) totalRetries++

      try {
        const tentativaAtual = dest.tentativas + 1

        // 1. Busca/cria conversa individual
        let conversa = await prisma.conversaIA.findFirst({
          where: { canal: 'whatsapp', remoteJid: dest.remoteJid },
          orderBy: { atualizadaEm: 'desc' },
          select: { id: true, atribuidaParaId: true },
        })

        if (!conversa) {
          conversa = await prisma.conversaIA.create({
            data: {
              canal: 'whatsapp',
              remoteJid: dest.remoteJid,
              atribuidaParaId: envio.operadorId,
              atribuidaEm: new Date(),
              ...(dest.clienteId ? { clienteId: dest.clienteId } : {}),
              ...(dest.socioId ? { socioId: dest.socioId } : {}),
            },
            select: { id: true, atribuidaParaId: true },
          })
        }

        // 2. Envia via Evolution API
        let result
        if (envio.mediaUrl && mediaUrlResolvida && envio.mediaMimeType) {
          const mediatype: MediaType = envio.mediaType === 'image' ? 'image' : 'document'
          result = await sendMedia(cfg, dest.remoteJid, {
            mediatype,
            mimetype: envio.mediaMimeType,
            fileName: envio.mediaFileName ?? 'arquivo',
            caption: envio.conteudo || undefined,
            mediaUrl: mediaUrlResolvida,
          })
        } else {
          result = await sendText(cfg, dest.remoteJid, envio.conteudo)
        }

        // 3. CRÍTICO: marca destinatário ANTES das operações de DB secundárias.
        //    Evita que falha de DB cause retry com mensagem duplicada no WhatsApp.
        if (result.ok) {
          await prisma.destinatarioEnvio.update({
            where: { id: dest.id },
            data: { status: 'enviado', erroEnvio: null, enviadoEm: new Date(), tentativas: tentativaAtual },
          })
          if (isRetry) {
            await prisma.envioTransmissao.update({
              where: { id: envio.id },
              data: { totalEnviados: { increment: 1 }, totalFalhas: { decrement: 1 } },
            })
          } else {
            await prisma.envioTransmissao.update({
              where: { id: envio.id },
              data: { totalEnviados: { increment: 1 } },
            })
          }
          totalEnviados++
        } else {
          await prisma.destinatarioEnvio.update({
            where: { id: dest.id },
            data: { status: 'falhou', erroEnvio: result.error, tentativas: tentativaAtual },
          })
          if (!isRetry) {
            await prisma.envioTransmissao.update({
              where: { id: envio.id },
              data: { totalFalhas: { increment: 1 } },
            })
          }
          if (tentativaAtual < MAX_TENTATIVAS) {
            console.warn(`[broadcast] destinatário ${dest.remoteJid} falhou (tentativa ${tentativaAtual}/${MAX_TENTATIVAS}), será retentado`)
          } else {
            console.error(`[broadcast] destinatário ${dest.remoteJid} falhou definitivamente após ${MAX_TENTATIVAS} tentativas: ${result.error}`)
          }
          totalFalhas++
        }

        // 4. Operações secundárias (falha aqui NÃO causa retry — destinatário já marcado)
        if (result.ok) {
          // MensagemIA na conversa individual (para IA ter contexto)
          await prisma.mensagemIA.create({
            data: {
              conversaId: conversa.id,
              role: 'assistant',
              operadorId: envio.operadorId,
              conteudo: envio.conteudo || (envio.mediaFileName ? `[Arquivo: ${envio.mediaFileName}]` : '[Broadcast]'),
              status: 'sent',
              tentativas: tentativaAtual,
              mediaUrl: envio.mediaUrl,
              mediaType: envio.mediaType,
              mediaFileName: envio.mediaFileName,
              mediaMimeType: envio.mediaMimeType,
              whatsappMsgData: result.key ? { key: result.key } : undefined,
            },
          })

          // Atualiza conversa — atualizadaEm + auto-atribuição
          await prisma.conversaIA.update({
            where: { id: conversa.id },
            data: {
              atualizadaEm: new Date(),
              ...(!conversa.atribuidaParaId ? {
                atribuidaParaId: envio.operadorId,
                atribuidaEm: new Date(),
              } : {}),
            },
          })

          // Interação no feed do cliente
          if (dest.clienteId) {
            try {
              await prisma.interacao.create({
                data: {
                  clienteId: dest.clienteId,
                  usuarioId: envio.operadorId,
                  tipo: 'whatsapp_enviado',
                  titulo: 'Broadcast WhatsApp enviado',
                  conteudo: envio.conteudo || (envio.mediaFileName ? `[Arquivo: ${envio.mediaFileName}]` : '[Broadcast]'),
                },
              })
            } catch (interacaoErr) {
              console.error('[broadcast] erro ao registrar interação:', interacaoErr)
            }
          }

          // SSE refresh
          emitWhatsAppRefresh(conversa.id)
        } else if (tentativaAtual >= MAX_TENTATIVAS) {
          // Última tentativa falhou — persiste como failed no chat para histórico
          await prisma.mensagemIA.create({
            data: {
              conversaId: conversa.id,
              role: 'assistant',
              operadorId: envio.operadorId,
              conteudo: envio.conteudo || (envio.mediaFileName ? `[Arquivo: ${envio.mediaFileName}]` : '[Broadcast]'),
              status: 'failed',
              tentativas: tentativaAtual,
              erroEnvio: result.error,
              mediaUrl: envio.mediaUrl,
              mediaType: envio.mediaType,
              mediaFileName: envio.mediaFileName,
              mediaMimeType: envio.mediaMimeType,
            },
          })
        }
        // Se falhou mas ainda tem retries, NÃO cria MensagemIA (evita duplicatas no chat)
      } catch (err) {
        console.error(`[broadcast] erro ao enviar para ${dest.remoteJid}:`, err)
        Sentry.captureException(err, {
          tags: { module: 'broadcast', operation: 'enviar-destinatario' },
          extra: { envioId: envio.id, destinatarioId: dest.id, remoteJid: dest.remoteJid, tentativa: dest.tentativas + 1 },
        })

        const tentativaAtual = dest.tentativas + 1
        try {
          await prisma.destinatarioEnvio.update({
            where: { id: dest.id },
            data: {
              status: 'falhou',
              erroEnvio: err instanceof Error ? err.message : String(err),
              tentativas: tentativaAtual,
            },
          })
          if (!isRetry) {
            await prisma.envioTransmissao.update({
              where: { id: envio.id },
              data: { totalFalhas: { increment: 1 } },
            })
          }
        } catch (updateErr) {
          console.error('[broadcast] erro ao atualizar status do destinatário:', updateErr)
          Sentry.captureException(updateErr, {
            tags: { module: 'broadcast', operation: 'update-status-falha' },
            extra: { envioId: envio.id, destinatarioId: dest.id },
          })
        }
        totalFalhas++
      }

      // Delay entre envios (anti-ban)
      await delay(DELAY_ENTRE_ENVIOS_MS)
    }

    // Verificar se todos os destinatários foram processados (sem pendentes nem retentáveis)
    await finalizarEnvio(envio.id)
  }

  return { enviosProcessados: envios.length, totalEnviados, totalFalhas, totalRetries }
}

/** Verifica se todos os destinatários foram processados e finaliza o envio */
async function finalizarEnvio(envioId: string) {
  // Pendentes ou falhos que ainda podem ser retentados
  const retentaveis = await prisma.destinatarioEnvio.count({
    where: {
      envioId,
      OR: [
        { status: 'pendente' },
        { status: 'falhou', tentativas: { lt: MAX_TENTATIVAS } },
      ],
    },
  })

  if (retentaveis === 0) {
    const falhasDefinitivas = await prisma.destinatarioEnvio.count({
      where: { envioId, status: 'falhou' },
    })

    await prisma.envioTransmissao.update({
      where: { id: envioId },
      data: {
        status: falhasDefinitivas > 0 ? 'falhou' : 'concluido',
      },
    })
  }
}
