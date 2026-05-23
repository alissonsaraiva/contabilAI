---
name: feedback_cron_healthchecks
description: Todo novo endpoint de cron deve ser instrumentado no healthchecks.io com start/ok/fail via src/lib/healthchecks.ts
type: feedback
---

Todo novo cron endpoint deve ser instrumentado no **healthchecks.io** (conta: alissonsaraiva@gmail.com).

**Why:** Crons que param de rodar falham silenciosamente — sem erro no Sentry, sem log. O healthchecks.io alerta por email quando o ping some.

**How to apply:**

1. Criar check em https://healthchecks.io com period e grace adequados ao intervalo do cron
2. Adicionar var `HC_<NOME>` no `.env` da VPS (`/home/deploy/contabai/.env`) com o UUID do check
3. Adicionar a mesma var no `.env.example` do projeto
4. No route handler, usar o helper `src/lib/healthchecks.ts`:

```typescript
import { hc } from '@/lib/healthchecks'

// início da execução (após autenticação)
void hc.start(process.env.HC_<NOME>)

// ao final com sucesso
void hc.ok(process.env.HC_<NOME>)

// no catch principal
void hc.fail(process.env.HC_<NOME>)
```

5. Atualizar a tabela de Cron Jobs em `docs/SISTEMA.md` com a nova linha e a var `HC_*`

**Crons já instrumentados (2026-04-03):**

| Var | Rota | Período |
|-----|------|---------|
| `HC_EMAIL_SYNC` | `/api/email/sync` | 5 min |
| `HC_PROCESSAR_PENDENTES` | `/api/whatsapp/processar-pendentes` | 1 min |
| `HC_AGENTE` | `/api/agente/cron` | 1 min |
| `HC_RECONCILIAR_NOTAS` | `/api/cron/reconciliar-notas` | 1 hora |
| `HC_RETRY_DOCUMENTOS` | `/api/cron/retry-documentos` | 1 hora |
