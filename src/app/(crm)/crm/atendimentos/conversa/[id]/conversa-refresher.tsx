'use client'

/**
 * ConversaRefresher
 *
 * Abre SSE para /api/stream/conversas/[id] e chama router.refresh() ao
 * receber evento. Reconecta com backoff exponencial em caso de falha.
 * Também faz polling de 8s como fallback (garante atualização mesmo quando
 * o eventBus não funciona entre múltiplos workers do Next.js em produção).
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function ConversaRefresher({ conversaId }: { conversaId: string }) {
  const router = useRouter()

  // SSE com reconexão robusta
  useEffect(() => {
    let es: EventSource
    let tentativas = 0
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let encerrado = false

    function conectar() {
      es = new EventSource(`/api/stream/conversas/${conversaId}`)
      es.onmessage = () => { tentativas = 0; router.refresh() }
      es.onerror   = () => {
        es.close()
        if (encerrado || tentativas >= 5) return
        tentativas++
        timeoutId = setTimeout(conectar, Math.min(1000 * 2 ** tentativas, 30_000))
      }
    }

    conectar()
    return () => {
      encerrado = true
      if (timeoutId) clearTimeout(timeoutId)
      es?.close()
    }
  }, [conversaId, router])

  // Polling de 8s — fallback para múltiplos workers em produção
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) router.refresh()
    }, 8_000)
    return () => clearInterval(id)
  }, [router])

  return null
}
