import * as Sentry from '@sentry/nextjs'

// Só inicializa em produção — nunca captura erros em dev local
if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // 10% de amostragem de performance em produção
    tracesSampleRate: 0.1,

    // Session replay desativado (custo). Ativar se precisar investigar UX bugs.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Ruído sem valor — não envia pro Sentry
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      /^NetworkError/,
      /^AbortError/,
      /ChunkLoadError/,
    ],
  })
}
