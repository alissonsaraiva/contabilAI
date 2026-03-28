'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 16, fontFamily: 'sans-serif' }}>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>Algo deu errado</h2>
          <p style={{ color: '#666', fontSize: 14 }}>O erro foi registrado automaticamente.</p>
          <button
            onClick={reset}
            style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  )
}
