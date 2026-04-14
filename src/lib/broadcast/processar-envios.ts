/**
 * Processador assíncrono de envios de broadcast (listas de transmissão).
 *
 * Chamado pelo cron da VPS a cada ~15s.
 *
 * Para cada envio em status "processando":
 *   1. Busca destinatários pendentes
 *   2. Resolve config Evolution API
 *   3. Para cada destinatário:
 *     a. Busca/cria ConversaIA (WhatsApp) individual
 *     b. Envia via Evolution (sendText ou sendMedia)
 *     c. Cria MensagemIA na conversa individual (para IA ter contexto)
 *     d. Emite SSE refresh
 *     e. Atualiza status do destinatário
 *     f. Delay entre mensagens (anti-ban)
 *   4. Atualiza contadores do envio
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

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export async function processarEnviosPendentes(): Promise<{
  enviosProcessados: number
  totalEnviados: number
  totalFalhas: number
}> {
  let totalEnviados = 0
  let totalFalhas = 0

  // Busca envios em processamento (FIFO)
  const envios = await prisma.envioTransmissao.findMany({
    where: { status: 'processando' },
    orderBy: { criadoEm: 'asc' },
    take: MAX_ENVIOS_POR_EXECUCAO,
    include: {
      destinatarios: {
        where: { status: 'pendente' },
        take: 20, // Processa até 20 destinatários por execução
      },
    },
  })

  if (envios.length === 0) return { enviosProcessados: 0, totalEnviados: 0, totalFalhas: 0 }

  const cfg = await getEvolutionConfig()
  if (!cfg) {
    console.warn('[broadcast] Evolution API não configurada — abortando processamento')
    return { enviosProcessados: 0, totalEnviados: 0, totalFalhas: 0 }
  }

  for (const envio of envios) {
    if (envio.destinatarios.length === 0) {
      // Todos os destinatários já foram processados — marcar envio como concluído
      await finalizarEnvio(envio.id)
      continue
    }

    // Resolver URL de mídia assinada (se houver)
    let mediaUrlResolvida: string | null = null
    if (envio.mediaUrl) {
      mediaUrlResolvida = await resolveMediaUrl(envio.mediaUrl, `broadcast:${envio.id}`)
    }

    for (const dest of envio.destinatarios) {
      try {
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

        // 3. Persiste MensagemIA na conversa individual (para contexto da IA)
        if (result.ok) {
          await prisma.mensagemIA.create({
            data: {
              conversaId: conversa.id,
              role: 'assistant',
              operadorId: envio.operadorId,
              conteudo: envio.conteudo || (envio.mediaFileName ? `[Arquivo: ${envio.mediaFileName}]` : '[Broadcast]'),
              status: 'sent',
              tentativas: 1,
              mediaUrl: envio.mediaUrl,
              mediaType: envio.mediaType,
              mediaFileName: envio.mediaFileName,
              mediaMimeType: envio.mediaMimeType,
              whatsappMsgData: result.key ? { key: result.key } : undefined,
            },
          })
        } else {
          await prisma.mensagemIA.create({
            data: {
              conversaId: conversa.id,
              role: 'assistant',
              operadorId: envio.operadorId,
              conteudo: envio.conteudo || (envio.mediaFileName ? `[Arquivo: ${envio.mediaFileName}]` : '[Broadcast]'),
              status: 'failed',
              tentativas: result.attempts,
              erroEnvio: result.error,
              mediaUrl: envio.mediaUrl,
              mediaType: envio.mediaType,
              mediaFileName: envio.mediaFileName,
              mediaMimeType: envio.mediaMimeType,
            },
          })
        }

        // 4. Atualiza conversa — atualizadaEm + auto-atribuição ao operador que disparou o broadcast
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

        // 5. Registra interação no feed do cliente (se enviado com sucesso)
        if (result.ok && dest.clienteId) {
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
            // Não bloqueia o envio se falhar — interação é secundária
            console.error('[broadcast] erro ao registrar interação:', interacaoErr)
          }
        }

        // 6. SSE refresh
        emitWhatsAppRefresh(conversa.id)

        // 6. Atualiza destinatário
        await prisma.destinatarioEnvio.update({
          where: { id: dest.id },
          data: {
            status: result.ok ? 'enviado' : 'falhou',
            erroEnvio: result.ok ? null : result.error,
            enviadoEm: result.ok ? new Date() : null,
          },
        })

        // 7. Atualiza contadores do envio
        if (result.ok) {
          await prisma.envioTransmissao.update({
            where: { id: envio.id },
            data: { totalEnviados: { increment: 1 } },
          })
          totalEnviados++
        } else {
          await prisma.envioTransmissao.update({
            where: { id: envio.id },
            data: { totalFalhas: { increment: 1 } },
          })
          totalFalhas++
        }
      } catch (err) {
        console.error(`[broadcast] erro ao enviar para ${dest.remoteJid}:`, err)
        Sentry.captureException(err, {
          tags: { module: 'broadcast', operation: 'enviar-destinatario' },
          extra: { envioId: envio.id, destinatarioId: dest.id, remoteJid: dest.remoteJid },
        })

        // Marca destinatário como falhou
        try {
          await prisma.destinatarioEnvio.update({
            where: { id: dest.id },
            data: {
              status: 'falhou',
              erroEnvio: err instanceof Error ? err.message : String(err),
            },
          })
          await prisma.envioTransmissao.update({
            where: { id: envio.id },
            data: { totalFalhas: { increment: 1 } },
          })
        } catch (updateErr) {
          console.error('[broadcast] erro ao atualizar status do destinatário:', updateErr)
        }
        totalFalhas++
      }

      // Delay entre envios (anti-ban)
      await delay(DELAY_ENTRE_ENVIOS_MS)
    }

    // Verificar se todos os destinatários foram processados
    await finalizarEnvio(envio.id)
  }

  return { enviosProcessados: envios.length, totalEnviados, totalFalhas }
}

/** Verifica se todos os destinatários foram processados e finaliza o envio */
async function finalizarEnvio(envioId: string) {
  const pendentes = await prisma.destinatarioEnvio.count({
    where: { envioId, status: 'pendente' },
  })

  if (pendentes === 0) {
    const falhas = await prisma.destinatarioEnvio.count({
      where: { envioId, status: 'falhou' },
    })

    await prisma.envioTransmissao.update({
      where: { id: envioId },
      data: {
        status: falhas > 0 ? 'falhou' : 'concluido',
      },
    })
  }
}
