/**
 * GET /api/stream/escalacoes/[id]?sessionId=xxx
 *
 * SSE endpoint para o widget de onboarding aguardar a resposta de uma escalação.
 * Não requer auth de sessão — valida ownership via sessionId (igual ao poll existente).
 * Substitui o setTimeout recursivo de 4s no chat-widget.tsx.
 */

import { prisma } from '@/lib/prisma'
import { eventBus } from '@/lib/event-bus'
import type { EventEscalacaoResolvida } from '@/lib/event-bus'

const KEEPALIVE_MS = 25_000
const TIMEOUT_MS   = 20 * 60 * 1000 // 20 min — igual ao deadline do poll anterior

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const sessionId = new URL(req.url).searchParams.get('sessionId')

  // Valida que a escalação existe e pertence a esta sessão
  const esc = await prisma.escalacao.findUnique({
    where:  { id },
    select: { id: true, status: true, respostaEnviada: true, sessionId: true },
  })

  if (!esc) {
    return new Response('not found', { status: 404 })
  }

  if (sessionId && esc.sessionId && esc.sessionId !== sessionId) {
    return new Response('forbidden', { status: 403 })
  }

  // Se já resolvida, responde imediatamente sem abrir stream
  if (esc.status === 'resolvida' && esc.respostaEnviada) {
    const data = JSON.stringify({ status: 'resolvida', resposta: esc.respostaEnviada })
    return new Response(`data: ${data}\n\n`, {
      headers: {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection':    'keep-alive',
      },
    })
  }

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder()

      const send = (payload: object) => {
        // eslint-disable-next-line no-empty -- controller já fechado se cliente desconectou
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`)) } catch {}
      }

      // Timeout de 20min — mesma lógica do poll anterior
      const timeout = setTimeout(() => {
        send({ status: 'timeout' })
        cleanup()
        controller.close()
      }, TIMEOUT_MS)

      // Keepalive a cada 25s para não cair por inatividade
      const keepalive = setInterval(() => {
        // eslint-disable-next-line no-empty -- controller já fechado se cliente desconectou
        try { controller.enqueue(enc.encode(': ping\n\n')) } catch {}
      }, KEEPALIVE_MS)

      const handler = (payload: EventEscalacaoResolvida) => {
        send(payload)
        cleanup()
        controller.close()
      }

      eventBus.on(`escalacao:${id}`, handler)

      function cleanup() {
        clearTimeout(timeout)
        clearInterval(keepalive)
        eventBus.off(`escalacao:${id}`, handler)
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
