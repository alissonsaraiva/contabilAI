'use client'

/**
 * ConversaRefresher
 *
 * Componente client-side que abre um SSE para /api/stream/conversas/[id] e
 * chama router.refresh() ao receber qualquer evento (nova mensagem WhatsApp
 * ou mensagem de cliente portal durante conversa pausada).
 *
 * Montado apenas enquanto conversaId estiver definido.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function ConversaRefresher({ conversaId }: { conversaId: string }) {
  const router = useRouter()

  useEffect(() => {
    const es = new EventSource(`/api/stream/conversas/${conversaId}`)

    es.onmessage = () => {
      router.refresh()
    }

    es.onerror = () => {
      // SSE fechou — reconecta automaticamente pelo browser
    }

    return () => {
      es.close()
    }
  }, [conversaId, router])

  return null
}
