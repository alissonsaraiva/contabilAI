/**
 * GET /api/stream/conversas/[id]
 *
 * SSE endpoint para o WhatsApp Drawer do CRM receber notificações de novas mensagens.
 * Requer auth CRM (admin/contador). Emite { type: 'refresh' } quando chega mensagem nova.
 * Substitui o setInterval de 4s no whatsapp-drawer.tsx.
 */

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { eventBus } from '@/lib/event-bus'
import type { EventWhatsAppRefresh, EventPortalUserMessage } from '@/lib/event-bus'

const KEEPALIVE_MS = 25_000

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user    = session?.user as any
  if (!session || (user?.tipo !== 'admin' && user?.tipo !== 'contador')) {
    return new Response('unauthorized', { status: 401 })
  }

  const { id } = await params

  // Valida que a conversa existe
  const conversa = await prisma.conversaIA.findUnique({
    where:  { id },
    select: { id: true },
  })
  if (!conversa) return new Response('not found', { status: 404 })

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder()

      const send = (payload: object) => {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`)) } catch {}
      }

      const keepalive = setInterval(() => {
        try { controller.enqueue(enc.encode(': ping\n\n')) } catch {}
      }, KEEPALIVE_MS)

      const waHandler = (_payload: EventWhatsAppRefresh) => send({ type: 'refresh' })
      const puHandler = (_payload: EventPortalUserMessage) => send({ type: 'refresh' })
      eventBus.on(`whatsapp:${id}`,    waHandler)
      eventBus.on(`portal-user:${id}`, puHandler)

      function cleanup() {
        clearInterval(keepalive)
        eventBus.off(`whatsapp:${id}`,    waHandler)
        eventBus.off(`portal-user:${id}`, puHandler)
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
