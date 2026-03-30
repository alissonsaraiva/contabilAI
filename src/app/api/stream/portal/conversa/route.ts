/**
 * GET /api/stream/portal/conversa?sessionId=xxx
 *
 * SSE endpoint para o portal Clara receber mensagens do operador humano em tempo real.
 * Requer auth de portal (cookie de sessão). Usa sessionId para localizar a conversa.
 * Substitui o setInterval de 5s adicionado no portal-clara.tsx.
 */

import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { eventBus } from '@/lib/event-bus'
import type { EventConversaMensagem } from '@/lib/event-bus'

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
  const clienteId = user.tipo === 'socio'
    ? (await prisma.cliente.findUnique({ where: { empresaId: user.empresaId }, select: { id: true } }))?.id
    : user.id

  if (!clienteId) return new Response('forbidden', { status: 403 })
  if (conversa.clienteId !== clienteId) {
    return new Response('forbidden', { status: 403 })
  }

  const conversaId = conversa.id

  const stream = new ReadableStream({
    start(controller) {
      const enc  = new TextEncoder()

      const send = (payload: object) => {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`)) } catch {}
      }

      const keepalive = setInterval(() => {
        try { controller.enqueue(enc.encode(': ping\n\n')) } catch {}
      }, KEEPALIVE_MS)

      const handler = (payload: EventConversaMensagem) => send(payload)
      eventBus.on(`conversa:${conversaId}`, handler)

      function cleanup() {
        clearInterval(keepalive)
        eventBus.off(`conversa:${conversaId}`, handler)
      }

      req.signal.addEventListener('abort', () => {
        cleanup()
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
