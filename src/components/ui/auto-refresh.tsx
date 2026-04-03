'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Componente invisível que mantém Server Components atualizados em tempo real.
 * - Chama router.refresh() no intervalo configurado (padrão: 60s)
 * - Também atualiza quando o usuário volta para a aba (visibilitychange)
 * - Respeita document.hidden para não consumir recursos em background
 */
export function AutoRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) router.refresh()
    }
    document.addEventListener('visibilitychange', tick)
    const id = setInterval(tick, intervalMs)
    return () => {
      document.removeEventListener('visibilitychange', tick)
      clearInterval(id)
    }
  }, [intervalMs, router])

  return null
}
