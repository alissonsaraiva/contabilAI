'use client'

import { useRouter } from 'next/navigation'

export function ClienteRow({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter()
  return (
    <tr
      onClick={() => {
        // refresh() invalida o Router Cache para que push() busque RSC payload fresco do servidor.
        // Sem isso, navegar A→B pode mostrar A's data se o cache tiver uma entrada stale.
        router.refresh()
        router.push(href)
      }}
      className="group cursor-pointer transition-colors hover:bg-surface-container-low/50"
    >
      {children}
    </tr>
  )
}
