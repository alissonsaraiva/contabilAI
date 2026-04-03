/**
 * Stage 4 do pipeline processar-pendentes:
 * Processa a resposta da IA, detecta marcadores especiais e envia ao cliente.
 *
 * Responsabilidades:
 *   - Limpar notações internas da resposta ([Documento: ...], etc.)
 *   - Detectar ##LEAD## → criar lead e vincular à conversa
 *   - Detectar ##HUMANO## → criar escalação e pausar conversa
 *   - Persistir resposta via addMensagens
 *   - Enviar via sendHumanLike (com retries)
 *   - Marcar mensagens pending como sent/failed
 */

import * as Sentry                                        from '@sentry/nextjs'
import { prisma }                                         from '@/lib/prisma'
import { detectarEscalacao }                              from '@/lib/ai/ask'
import { addMensagens, atualizarStatusMensagem }          from '@/lib/ai/conversa'
import { sendHumanLike }                                  from '@/lib/whatsapp/human-like'
import { indexarAsync }                                   from '@/lib/rag/indexar-async'
import type { EvolutionConfig }                           from '@/lib/evolution'
import type { getHistorico }                              from '@/lib/ai/conversa'

type Conversa = {
  id:        string
  clienteId: string | null
  leadId:    string | null
  remoteJid: string | null
}

export type ProcessarRespostaInput = {
  conversa:      Conversa
  respostaRaw:   string   // resposta bruta da askAI — será limpa internamente
  historico:     Awaited<ReturnType<typeof getHistorico>>
  textoParaIA:   string
  textoAgregado: string
  cfg:           EvolutionConfig
  msgs:          Array<{ id: string }>
}

/**
 * Limpa notações internas, detecta marcadores, persiste e envia a resposta ao cliente.
 * Todos os erros são capturados com Sentry — nunca re-lança.
 */
export async function processarRespostaIA(input: ProcessarRespostaInput): Promise<void> {
  const { conversa, respostaRaw, historico, textoParaIA, textoAgregado, cfg, msgs } = input
  const remoteJid = conversa.remoteJid ?? ''

  // Remove notações internas que não devem aparecer para o cliente
  // Cobre variações: [Documento: ...], [Documento enviado: ...], [Documento recebido: ...], [Arquivo: ...]
  let resposta = respostaRaw
    .replace(/\[\s*(?:Documento|Arquivo)\s*[^\]]{0,300}\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // ── Detecta ##LEAD## ──────────────────────────────────────────────────────
  // A IA usa este marcador quando identifica que o contato deve virar lead
  if (!conversa.clienteId && !conversa.leadId && resposta.includes('##LEAD##')) {
    resposta = resposta.replace(/##LEAD##\s*/g, '').trimStart()
    try {
      const digits = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
      const novoLead = await prisma.lead.create({
        data: { contatoEntrada: digits, canal: 'whatsapp', funil: 'prospeccao', status: 'iniciado' },
      })
      await prisma.conversaIA.update({
        where: { id: conversa.id },
        data:  { leadId: novoLead.id },
      })
    } catch (err) {
      console.error('[processar-pendentes] erro ao criar lead via ##LEAD##:', { remoteJid, conversaId: conversa.id, err })
      Sentry.captureException(err, { tags: { module: 'processar-pendentes', operation: 'criar-lead-hashtag' }, extra: { conversaId: conversa.id, remoteJid } })
    }
  }

  // ── Detecta ##HUMANO## ────────────────────────────────────────────────────
  // A IA usa este marcador quando precisa escalar para atendente humano
  const escalInfo = detectarEscalacao(resposta)
  if (escalInfo.escalado) {
    resposta = escalInfo.textoLimpo
    await prisma.escalacao.create({
      data: {
        canal:          'whatsapp',
        status:         'pendente',
        clienteId:      conversa.clienteId ?? null,
        leadId:         conversa.leadId    ?? null,
        remoteJid,
        historico:      historico as object[],
        ultimaMensagem: textoParaIA || textoAgregado,
        motivoIA:       escalInfo.motivo,
      },
    }).then(esc => {
      indexarAsync('escalacao', {
        id:        esc.id,
        clienteId: esc.clienteId,
        leadId:    esc.leadId,
        canal:     'whatsapp',
        motivoIA:  esc.motivoIA,
        criadoEm:  esc.criadoEm,
      })
    }).catch((err: unknown) => {
      console.error('[processar-pendentes] erro ao indexar escalação no RAG:', { conversaId: conversa.id, err })
      Sentry.captureException(err, { tags: { module: 'processar-pendentes', operation: 'indexar-escalacao-rag' }, extra: { conversaId: conversa.id } })
    })
    await prisma.conversaIA.update({
      where: { id: conversa.id },
      data:  { pausadaEm: new Date() },
    }).catch((err: unknown) => {
      console.error('[processar-pendentes] CRÍTICO: falha ao pausar conversa após escalação:', { conversaId: conversa.id, err })
      Sentry.captureException(err, { tags: { module: 'processar-pendentes', operation: 'pause_after_escalacao' }, extra: { conversaId: conversa.id } })
    })
  }

  // ── Persiste resposta e envia ─────────────────────────────────────────────
  const mensagemId = await addMensagens(conversa.id, textoParaIA || textoAgregado, resposta)
  const sendResult = await sendHumanLike(cfg, remoteJid, resposta)

  if (sendResult.ok) {
    // Remove as mensagens pending originais — addMensagens já criou a cópia canônica com status=sent.
    // Isso evita duplicatas visíveis na conversa.
    await prisma.mensagemIA.deleteMany({
      where: { id: { in: msgs.map(m => m.id) } },
    }).catch((err: unknown) => {
      console.error('[processar-pendentes] erro ao deletar msgs pending originais:', { conversaId: conversa.id, err })
      Sentry.captureException(err, { tags: { module: 'processar-pendentes', operation: 'deletar-msgs-pending' }, extra: { conversaId: conversa.id } })
    })
    atualizarStatusMensagem(mensagemId, 'sent').catch((err: unknown) => {
      console.error('[processar-pendentes] erro ao atualizar status para sent:', { mensagemId, err })
      Sentry.captureException(err, { tags: { module: 'processar-pendentes', operation: 'atualizar-status-sent' }, extra: { mensagemId } })
    })
  } else {
    Sentry.captureMessage('WhatsApp sendHumanLike falhou após retries', {
      level: 'error',
      tags:  { module: 'processar-pendentes', canal: 'whatsapp' },
      extra: { conversaId: conversa.id, remoteJid: conversa.remoteJid, attempts: sendResult.attempts, error: sendResult.error },
    })
    atualizarStatusMensagem(mensagemId, 'failed', {
      tentativas: sendResult.attempts,
      erroEnvio:  sendResult.error,
    }).catch((err: unknown) => {
      console.error('[processar-pendentes] erro ao atualizar status para failed:', { mensagemId, err })
      Sentry.captureException(err, { tags: { module: 'processar-pendentes', operation: 'atualizar-status-failed' }, extra: { mensagemId } })
    })
  }
}
