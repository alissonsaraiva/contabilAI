'use client'

import { useRouter } from 'next/navigation'

export function ClienteRow({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter()
  return (
    <tr
      onClick={() => router.push(href)}
      className="group cursor-pointer transition-colors hover:bg-surface-container-low/50"
    >
      {children}
    </tr>
  )
}
