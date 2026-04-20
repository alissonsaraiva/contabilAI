/**
 * Setup global para testes unitários.
 * Roda antes de cada arquivo de teste (via setupFiles no vitest.config.ts).
 */

// Variáveis de ambiente padrão para testes
;(process.env as Record<string, string>).NODE_ENV = 'test'
process.env.STORAGE_PUBLIC_URL = 'https://storage.test.example.com'
process.env.WEBHOOK_SECRET = 'test-secret'
