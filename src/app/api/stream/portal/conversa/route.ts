/**
 * GET /api/stream/portal/conversa?sessionId=xxx
 *
 * SSE endpoint para o portal Clara receber mensagens do operador humano em tempo real.
 * Requer auth de portal (cookie de sessão). Usa sessionId para localizar a conversa.
 * Substitui o setInterval de 5s adicionado no portal-clara.tsx.
 */

import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { eventBus } from '@/lib/event-bus'
import type { EventConversaMensagem, EventMensagemExcluida } from '@/lib/event-bus'

const KEEPALIVE_MS = 25_000

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return new Response('unauthorized', { status: 401 })
  }

  const sessionId = new URL(req.url).searchParams.get('sessionId')
  if (!sessionId) return new Response('sessionId obrigatório', { status: 400 })

  // Localiza a conversa pelo sessionId + valida que pertence a este cliente
  const conversa = await prisma.conversaIA.findFirst({
    where:   { sessionId, canal: 'portal' },
    orderBy: { atualizadaEm: 'desc' },
    select:  { id: true, clienteId: true },
  })

  if (!conversa) return new Response('conversa não encontrada', { status: 404 })

  // Garante que o cliente autenticado é o dono da conversa
  const clienteId = await resolveClienteId(user)

  if (!clienteId) return new Response('forbidden', { status: 403 })
  if (conversa.clienteId !== clienteId) {
    return new Response('forbidden', { status: 403 })
  }

  const conversaId = conversa.id

  const stream = new ReadableStream({
    start(controller) {
      const enc  = new TextEncoder()

      const send = (payload: object) => {
        // eslint-disable-next-line no-empty -- controller já fechado se cliente desconectou
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`)) } catch {}
      }

      const keepalive = setInterval(() => {
        // eslint-disable-next-line no-empty -- controller já fechado se cliente desconectou
        try { controller.enqueue(enc.encode(': ping\n\n')) } catch {}
      }, KEEPALIVE_MS)

      const handler    = (payload: EventConversaMensagem) => send(payload)
      const delHandler = (payload: EventMensagemExcluida) => send(payload)
      eventBus.on(`conversa:${conversaId}`,          handler)
      eventBus.on(`mensagem-excluida:${conversaId}`, delHandler)

      function cleanup() {
        clearInterval(keepalive)
        eventBus.off(`conversa:${conversaId}`,          handler)
        eventBus.off(`mensagem-excluida:${conversaId}`, delHandler)
      }

      req.signal.addEventListener('abort', () => {
        cleanup()
        // eslint-disable-next-line no-empty -- controller pode já estar fechado no abort
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
    },
  })
}
