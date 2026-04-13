'use client'

import { useState, useEffect } from 'react'

type Badges = {
  escalacoes: number
  emails: number
  chamados: number
}

/**
 * Polling de 30s para manter os badges da sidebar/header atualizados em tempo real.
 * Aceita valores iniciais vindos do Server Component para evitar flash no primeiro render.
 */
export function useBadges(inicial?: Partial<Badges>): Badges {
  const [badges, setBadges] = useState<Badges>({
    escalacoes: inicial?.escalacoes ?? 0,
    emails:     inicial?.emails     ?? 0,
    chamados:   inicial?.chamados   ?? 0,
  })

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/badges')
        if (!res.ok) return
        const data = await res.json() as Badges
        setBadges(data)
      } catch (err) { console.error('[use-badges] falha ao carregar badges:', err) /* não interrompe a navegação */ }
    }

    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [])

  return badges
}
