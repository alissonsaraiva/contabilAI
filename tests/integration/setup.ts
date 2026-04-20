/**
 * Setup para testes de integração.
 * Requer PostgreSQL rodando via docker-compose.test.yml + setup-test-db.sh.
 */

;(process.env as Record<string, string>).NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5433/contabai_test'
process.env.VECTORS_DATABASE_URL = 'postgresql://test:test@localhost:5433/contabai_test'
process.env.STORAGE_PUBLIC_URL = 'https://storage.test.example.com'
process.env.AUTH_SECRET = 'test-auth-secret-minimum-32-chars!!'
process.env.ENCRYPTION_KEY = 'a'.repeat(64)
