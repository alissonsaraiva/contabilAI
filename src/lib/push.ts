/**
 * Utilitário de Web Push para o portal do cliente (PWA).
 *
 * Uso:
 *   import { sendPushToCliente } from '@/lib/push'
 *   await sendPushToCliente(clienteId, {
 *     title: 'Nova mensagem',
 *     body:  'O escritório enviou uma mensagem.',
 *     url:   '/portal/suporte',
 *   })
 *
 * Subscriptions expiradas (410 Gone) são removidas automaticamente do banco.
 */

import webpush from 'web-push'
import { prisma } from '@/lib/prisma'

const vapidPublic  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
const vapidPrivate = process.env.VAPID_PRIVATE_KEY!
const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:contato@avos.digital'

if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
}

export type PushPayload = {
  title: string
  body:  string
  /** URL para abrir ao clicar na notificação — default: /portal/dashboard */
  url?:  string
  /** Ícone customizado — default: /icons/icon-192.png */
  icon?: string
}

/**
 * Envia push notification para todos os devices de um cliente.
 * Falhas individuais são silenciosas (não interrompem o fluxo principal).
 * Subscriptions expiradas (410) são removidas automaticamente.
 */
export async function sendPushToCliente(
  clienteId: string,
  payload: PushPayload,
): Promise<void> {
  if (!vapidPublic || !vapidPrivate) {
    console.warn('[push] VAPID keys não configuradas — push ignorado.')
    return
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where:  { clienteId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  })

  if (subscriptions.length === 0) return

  const expiredIds: string[] = []

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 }, // 24h de TTL — entrega quando o device voltar online
        )
      } catch (err: any) {
        // 410 Gone = subscription expirada ou revogada pelo browser
        if (err?.statusCode === 410) {
          expiredIds.push(sub.id)
        } else {
          console.error('[push] Falha ao enviar push:', sub.endpoint, err?.message)
        }
      }
    })
  )

  // Remove subscriptions expiradas
  if (expiredIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: expiredIds } } })
  }
}
