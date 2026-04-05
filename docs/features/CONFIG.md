# CONFIG — Configuração e Deploy

> **Sistema:** AVOS v3.10.23 | **Fonte:** `SISTEMA.md` (extraído)

---

## Variáveis de Ambiente

```env
# ─── Banco de Dados ──────────────────────────────────────
DATABASE_URL="postgresql://user:pass@host:5432/contabil_ia"
VECTORS_DATABASE_URL="..."        # mesmo banco se tiver pgvector

# ─── Auth ────────────────────────────────────────────────
AUTH_SECRET="openssl rand -base64 32"
AUTH_URL="https://crm.avos.digital"

# ─── IA ──────────────────────────────────────────────────
ANTHROPIC_API_KEY=""
OPENAI_API_KEY=""          # opcional
OPENAI_BASE_URL=""         # opcional
GOOGLE_API_KEY=""          # opcional
GROQ_API_KEY=""            # opcional
VOYAGE_API_KEY=""          # para embeddings (alternativa ao Anthropic)

# ─── Storage (Cloudflare R2) ─────────────────────────────
STORAGE_ENDPOINT="https://<account>.r2.cloudflarestorage.com"
STORAGE_ACCESS_KEY_ID=""
STORAGE_SECRET_ACCESS_KEY=""
STORAGE_BUCKET_NAME="contabai"
STORAGE_PUBLIC_URL="https://storage.avos.digital"
STORAGE_REGION="auto"

# ─── WhatsApp (Evolution API) ────────────────────────────
EVOLUTION_API_URL=""
EVOLUTION_INSTANCE=""
EVOLUTION_API_KEY=""

# ─── Monitoramento ───────────────────────────────────────
NEXT_PUBLIC_SENTRY_DSN=""
SENTRY_ORG=""
SENTRY_PROJECT=""
SENTRY_AUTH_TOKEN=""

# ─── Web Push (PWA) ──────────────────────────────────────
NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
VAPID_SUBJECT="mailto:contato@avos.digital"

# ─── Cron Jobs ───────────────────────────────────────────
CRON_SECRET="openssl rand -base64 32"

# ─── Healthchecks.io (monitoramento de crons) ────────────
# UUIDs em https://healthchecks.io — conta alissonsaraiva@gmail.com
HC_EMAIL_SYNC=""
HC_RECONCILIAR_NOTAS=""
HC_RETRY_DOCUMENTOS=""
HC_AGENTE=""
HC_PROCESSAR_PENDENTES=""

# ─── URLs Públicas ───────────────────────────────────────
NEXT_PUBLIC_APP_URL="https://avos.digital"
NEXT_PUBLIC_CRM_URL="https://crm.avos.digital"
NEXT_PUBLIC_PORTAL_URL="https://portal.avos.digital"
```

> **Nota**: `EMAIL_*`, `ASAAS_*`, `SPEDY_*`, `CLICKSIGN_*`, `SERPRO_*` são configurados **por escritório** e salvos criptografados no banco (`Escritorio`), não em variáveis de ambiente globais.

## Setup Local

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env.local

# 3. Gerar cliente Prisma
npx prisma generate

# 4. Aplicar migrations no banco local
npx prisma migrate dev

# 5. Seed de dados iniciais (planos)
npx prisma db seed

# 6. Inicializar pgvector
psql $DATABASE_URL -f prisma/init-vectors.sql

# 7. Rodar em desenvolvimento
npm run dev
```

## Pre-deploy Checklist (OBRIGATÓRIO)

```bash
# 1. TypeScript sem erros
npx tsc --noEmit

# 2. Build de produção sem erros
npm run build

# 3. Criar tag de versão
git tag v3.x.y
git push origin v3.x.y  # CI só dispara com tag v*
```

## Cron Jobs

Todos os crons fazem ping no **healthchecks.io** (start/ok/fail) via `src/lib/healthchecks.ts`.

| Rota | Frequência | Descrição | Monitor |
|------|-----------|-----------|---------|
| `/api/email/sync` | `*/5 * * * *` | Sincronizar IMAP | `HC_EMAIL_SYNC` |
| `/api/whatsapp/processar-pendentes` | 5× por minuto | Processar fila WA (debounce) | `HC_PROCESSAR_PENDENTES` |
| `/api/agente/cron` | `* * * * *` | Disparar agendamentos do agente | `HC_AGENTE` |
| `/api/cron/reconciliar-notas` | `0 * * * *` | Fallback de reconciliação de NFS-e | `HC_RECONCILIAR_NOTAS` |
| `/api/cron/retry-documentos` | `0 * * * *` | Retry de resumo IA em documentos que falharam | `HC_RETRY_DOCUMENTOS` |

> ⚠️ **Cron VPS = config manual** — Deploy não configura crontab automaticamente.

## Infra VPS

- Host: `82.25.79.193`
- Usuário deploy: `deploy`
- PostgreSQL: porta `32768`
- DocuSeal: porta `32825`
- CI/CD: ghcr.io → 6 containers Docker via tag `v*`
- Backup: automático (verificar configuração)
