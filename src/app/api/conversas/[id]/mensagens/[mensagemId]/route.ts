/**
 * DELETE /api/conversas/[id]/mensagens/[mensagemId]
 *
 * Apaga uma mensagem para todos: remove no WhatsApp (Evolution API) e faz soft delete local.
 * Só é permitido para mensagens enviadas por nós (role === 'assistant').
 * Qualquer usuário CRM autenticado pode excluir.
 *
 * Comportamento por canal:
 *   - whatsapp: tenta deleteMessage() na Evolution; se falhar (ex: >60h), apenas loga no Sentry
 *               e continua com o soft delete local.
 *   - portal/crm/onboarding: apenas soft delete local.
 *
 * Após a exclusão emite EventMensagemExcluida no event-bus para propagação SSE em tempo real.
 */

import { prisma }                                            from '@/lib/prisma'
import { auth }                                              from '@/lib/auth'
import { NextResponse }                                      from 'next/server'
import * as Sentry                                           from '@sentry/nextjs'
import { deleteMessage, type EvolutionConfig, type WhatsAppKey } from '@/lib/evolution'
import { decrypt, isEncrypted }                              from '@/lib/crypto'
import { emitMensagemExcluida, emitWhatsAppRefresh, emitPortalUserMessage } from '@/lib/event-bus'

type Params = { params: Promise<{ id: string; mensagemId: string }> }

export async function DELETE(
  _req: Request,
  { params }: Params,
) {
  const session = await auth()
  const user    = session?.user as any
  if (!session || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id: conversaId, mensagemId } = await params

  // ── Busca mensagem incluindo payload WhatsApp ────────────────────────────────
  const mensagem = await prisma.mensagemIA.findUnique({
    where:  { id: mensagemId },
    select: {
      id:               true,
      conversaId:       true,
      role:             true,
      excluido:         true,
      whatsappMsgData:  true,
    },
  })

  if (!mensagem) {
    return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 })
  }

  if (mensagem.conversaId !== conversaId) {
    return NextResponse.json({ error: 'Mensagem não pertence a esta conversa' }, { status: 403 })
  }

  if (mensagem.role !== 'assistant') {
    return NextResponse.json({ error: 'Só é possível excluir mensagens enviadas por nós' }, { status: 403 })
  }

  if (mensagem.excluido) {
    return NextResponse.json({ ok: true }) // idempotente
  }

  // ── Busca canal da conversa ──────────────────────────────────────────────────
  const conversa = await prisma.conversaIA.findUnique({
    where:  { id: conversaId },
    select: { id: true, canal: true, remoteJid: true },
  })

  if (!conversa) {
    return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
  }

  // ── Tenta deletar no WhatsApp (somente canal whatsapp, fromMe) ───────────────
  if (conversa.canal === 'whatsapp' && mensagem.whatsappMsgData && conversa.remoteJid) {
    const msgData = mensagem.whatsappMsgData as Record<string, unknown>

    // Suporte a dois formatos:
    // - { keys: WhatsAppKey[] }  → mensagens enviadas por nós (IA ou operador) — multi-chunk
    // - { key: { fromMe, id } }  → formato legado de mensagens recebidas (não deve ocorrer no delete)
    const keysToDelete: WhatsAppKey[] = (() => {
      if (Array.isArray(msgData.keys)) {
        return (msgData.keys as WhatsAppKey[]).filter(k => k.fromMe && k.id)
      }
      const single = msgData.key as WhatsAppKey | undefined
      if (single?.fromMe && single?.id) return [single]
      return []
    })()

    if (keysToDelete.length > 0) {
      try {
        const row = await prisma.escritorio.findFirst({
          select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
        })

        if (row?.evolutionApiUrl && row.evolutionApiKey && row.evolutionInstance) {
          const cfg: EvolutionConfig = {
            baseUrl:  row.evolutionApiUrl,
            apiKey:   isEncrypted(row.evolutionApiKey) ? decrypt(row.evolutionApiKey) : row.evolutionApiKey,
            instance: row.evolutionInstance,
          }

          // Deleta cada chunk individualmente (respostas longas são enviadas em múltiplas mensagens)
          for (const waKey of keysToDelete) {
            const result = await deleteMessage(cfg, conversa.remoteJid, waKey.id)
            if (!result.ok) {
              // Falha silenciosa (ex: mensagem com >60h) — loga mas continua o soft delete local
              Sentry.captureMessage('deleteMessage Evolution API falhou (provavelmente >60h)', {
                level: 'warning',
                tags:  { module: 'mensagem-delete', operation: 'whatsapp-delete' },
                extra: { mensagemId, conversaId, waKeyId: waKey.id, error: result.error },
              })
            }
          }
        }
      } catch (err) {
        Sentry.captureException(err, {
          tags:  { module: 'mensagem-delete', operation: 'whatsapp-delete' },
          extra: { mensagemId, conversaId },
        })
        // Não bloqueia — continua o soft delete
      }
    }
  }

  // ── Soft delete local ────────────────────────────────────────────────────────
  try {
    await prisma.mensagemIA.update({
      where: { id: mensagemId },
      data:  { excluido: true, excluidoEm: new Date() },
    })
  } catch (err) {
    Sentry.captureException(err, {
      tags:  { module: 'mensagem-delete', operation: 'soft-delete' },
      extra: { mensagemId, conversaId },
    })
    return NextResponse.json({ error: 'Erro ao excluir mensagem' }, { status: 500 })
  }

  // ── Propaga em tempo real via SSE ────────────────────────────────────────────
  emitMensagemExcluida(conversaId, mensagemId)

  // Aciona refresh nos painéis CRM e portal que usam os eventos genéricos
  if (conversa.canal === 'whatsapp') {
    emitWhatsAppRefresh(conversaId)
  } else if (conversa.canal === 'portal') {
    emitPortalUserMessage(conversaId)
  }

  return NextResponse.json({ ok: true })
}
