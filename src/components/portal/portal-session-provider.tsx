'use client'

import { SessionProvider } from 'next-auth/react'

/**
 * Envolve todas as páginas do portal com o SessionProvider apontando para
 * o endpoint correto (/api/portal/auth).
 *
 * Isso garante que signIn/signOut usados em componentes cliente do portal
 * usem o cookie separado do portal e não interfiram na sessão do CRM.
 */
export function PortalSessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath="/api/portal/auth">
      {children}
    </SessionProvider>
  )
}
