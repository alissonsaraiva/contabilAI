---
name: Sentry obrigatório em toda alteração de código
description: Toda nova feature ou alteração de código deve incluir Sentry nos catch blocks relevantes
type: feedback
---

Todo catch block de operação crítica deve chamar `Sentry.captureException(err, { tags: { module: '...', operation: '...' }, extra: { ... } })`.

**Why:** O projeto ficou com 4,76% de cobertura de Sentry no início do projeto (2/42 catch blocks). Uma auditoria completa foi feita em 2026-04-01 cobrindo ~20+ arquivos. Para não repetir o problema, a regra passa a ser permanente.

**How to apply:**
- Ao criar qualquer novo arquivo com try/catch, incluir `import * as Sentry from '@sentry/nextjs'` e chamar `Sentry.captureException` em todos os catch blocks de operações críticas (pagamentos, IA, documentos, webhooks, uploads, NFS-e, WhatsApp, email, cron jobs)
- Catch blocks de validação de input (400) e autenticação (401) NÃO precisam de Sentry — só captura exceções inesperadas (500/502)
- Fire-and-forget de push notification failure = LOW, pode ser apenas console.error
- Padrão de tags: `{ module: '<contexto>', operation: '<ação>' }` + `extra` com IDs relevantes (clienteId, documentoId, etc.)
- Ao modificar código existente que tenha catch blocks, verificar se já tem Sentry e adicionar se estiver faltando
