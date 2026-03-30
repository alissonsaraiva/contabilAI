import * as Sentry from '@sentry/nextjs'

if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    // Captura 100% das exceções (sample rate afeta só traces de performance)
    sampleRate: 1.0,
    // Captura variáveis locais nas stack traces — muito útil para debug em produção
    includeLocalVariables: true,
  })
}
