---
name: project_vps_infra
description: VPS de produção — infra completa auditada em 2026-04-03: containers, redes, volumes, recursos, segurança, backups, git, imagens, problemas ativos
type: project
---

# VPS de Produção — Infraestrutura Completa

**Auditado em:** 2026-04-03 | **Atualizado em:** 2026-04-03 (v3.10.10)
**Host:** `82.25.79.193` — Hostinger (srv1524170.hstgr.cloud)
**SSH:** `ssh -o StrictHostKeyChecking=no deploy@82.25.79.193`

---

## Hardware

| Item | Valor |
|---|---|
| OS | Ubuntu 24.04.4 LTS |
| Kernel | 6.8.0-90-generic |
| CPU | 1 vCPU (AMD EPYC 9354P) |
| RAM | 3.8 GB total / ~1.4 GB usada / ~2.4 GB livre |
| Swap | 2.0 GB total / ~116 MB usada |
| Disco | 48 GB total / 14 GB usados (29%) / 34 GB livres |

---

## Containers Docker (6 ativos)

| Container | Imagem | Porta externa | Reinicia |
|---|---|---|---|
| `contabai_app` | `contabai:latest` | `3000` | a cada deploy (~15h de vida) |
| `traefik-zq71-traefik-1` | `traefik:latest` | `80`, `443` (host network) | estável (3+ dias) |
| `postgresql-4cnu-postgresql-1` | `postgres:17` | `32768→5432` | estável (3+ dias) |
| `evolution-api-swhw-api-1` | `evoapicloud/evolution-api:latest` | `42572→8080` | estável (3+ dias) |
| `evolution-api-swhw-postgres-1` | `postgres:15` | interno apenas | estável |
| `evolution-api-swhw-redis-1` | `redis:latest` | interno apenas | estável |

---

## Redes Docker

| Rede | Driver | Containers |
|---|---|---|
| `contabil_net` | bridge | `contabai_app` + `postgresql-4cnu-postgresql-1` |
| `evolution-api-swhw_default` | bridge | api + postgres + redis da Evolution |
| `host` | host | `traefik-zq71-traefik-1` |
| `postgresql-4cnu_default` | bridge | postgresql (também conectado à `contabil_net`) |

O PostgreSQL está em **duas redes**: `contabil_net` (para o app) e `postgresql-4cnu_default` (rede interna).

---

## Volumes Docker

| Volume | Tamanho |
|---|---|
| `postgresql-4cnu_postgres_data` | 95.66 MB |
| `evolution-api-swhw_postgres_data` | 68.53 MB |
| `evolution-api-swhw_redis_data` | 4.3 MB |
| `evolution-api-swhw_evolution_instances` | 0 B |
| `traefik-zq71_traefik-letsencrypt` | 33 KB (certs SSL) |

---

## Portas abertas externamente

| Porta | Serviço | Observação |
|---|---|---|
| 22 | SSH | — |
| 80 | Traefik → redirect HTTPS | — |
| 443 | Traefik HTTPS | — |
| 3000 | contabai_app (Next.js direto) | acessível além do Traefik |
| 32768 | PostgreSQL 17 | ⚠️ exposto sem firewall |
| 42572 | Evolution API | ⚠️ exposto sem firewall |

---

## Traefik

- Certificados: Let's Encrypt, email `alissonsaraiva@gmail.com`
- Domínios: `avos.digital`, `www.avos.digital`, `crm.avos.digital`, `portal.avos.digital`
- Backend único: `contabai_app:3000`
- Middleware: redirect HTTP→HTTPS
- Dashboard: desabilitado

---

## Crons (crontab do usuário `deploy`)

**CRON_SECRET:** `<CRON_SECRET>`

| Endpoint | Frequência |
|---|---|
| `/api/whatsapp/processar-pendentes` | a cada ~5s (loop de 12x por minuto) |
| `/api/agente/cron` | a cada 1 minuto |
| `/api/cron/retry-documentos` | a cada hora (minuto 0) |
| `/api/email/sync` | a cada 2 minutos |

Todos usam `curl -s -X POST https://crm.avos.digital/<endpoint> -H "Authorization: Bearer <CRON_SECRET>"`.

**IMPORTANTE:** ao criar/alterar endpoint de cron, configurar manualmente no crontab da VPS (o CI não faz isso).

---

## PostgreSQL — banco `contabil_ia`

**Acesso correto:**
```bash
docker exec postgresql-4cnu-postgresql-1 bash -c \
  "PGPASSWORD=<POSTGRES_PASSWORD> psql -U <POSTGRES_USER> contabil_ia -c 'QUERY'"
```

**Credenciais:**
- Usuário: `<POSTGRES_USER>`
- Senha: `<POSTGRES_PASSWORD>`
- Banco da aplicação: `contabil_ia` ← atenção: NÃO é `GU7ryn2OpPoWo3jP` (banco vazio padrão do `.env`)
- Porta externa: `32768`

**Extensões:** `pgvector 0.8.2`, `plpgsql 1.0`
**Tamanho total:** ~12 MB
**Conexões:** max=100 / ~7 ativas
**Migrations aplicadas:** 12 (última: `20260402213941_add_email_thread_fields`)

**Tabelas (nomes em lowercase — importante para queries):**

| Tabela | Registros aprox. |
|---|---|
| `_prisma_migrations` | 12 |
| `agendamentos_agente` | 0 |
| `agente_acoes` | 8 |
| `cliente_status_historico` | 0 |
| `clientes` | 0 |
| `cobrancas_asaas` | 0 |
| `comunicado_envios` | 0 |
| `comunicados` | 1 |
| `contratos` | 0 |
| `conversas_ia` | 3 |
| `documentos` | 4 |
| `embeddings` | 53 |
| `empresas` | 0 |
| `escalacoes` | 1 |
| `escritorio` | **0** ← sem registro; app pode falhar se buscar config |
| `interacoes` | 42 |
| `leads` | 0 |
| `mensagens_ia` | 13 |
| `notas_fiscais` | 0 |
| `notificacoes` | 179 |
| `ordens_servico` | 0 |
| `planos` | 0 |
| `portal_tokens` | 0 |
| `push_subscriptions` | 1 |
| `relatorios_agente` | 0 |
| `socios` | 0 |
| `usuarios` | 0 |
| `webhook_logs` | 0 |

---

## Evolution API

**URL externa:** `https://evolution-api-swhw.srv1524170.hstgr.cloud`
**API Key (do container):** `<EVOLUTION_API_KEY>`
**Instância WhatsApp configurada no banco:** `avos`
**URL armazenada no banco:** `https://evolution-api-swhw.srv1524170.hstgr.cloud`
**API Key no banco:** criptografada (prefixo `v6q5pXjFt6`, ENCRYPTION_KEY do app descriptografa)
**Config Evolution no container (.env):**
- `SERVER_URL=http://82.25.79.193:42572`
- `DATABASE_PROVIDER=postgresql`
- `TZ=America/Sao_Paulo`

**Testar conectividade:**
```bash
curl -s -o /dev/null -w '%{http_code}' \
  'https://evolution-api-swhw.srv1524170.hstgr.cloud/instance/fetchInstances' \
  -H 'apikey: <EVOLUTION_API_KEY>'
# 200 = OK, 401 = chave errada mas API viva, timeout = API fora do ar
```

---

## Variáveis de ambiente do `contabai_app`

Obtidas via: `docker inspect contabai_app | python3 -c "import sys,json; cfg=json.load(sys.stdin)[0]; [print(e) for e in cfg['Config']['Env']]"`

| Variável | Status |
|---|---|
| `DATABASE_URL` | ✅ `postgresql://...@postgresql-4cnu-postgresql-1:5432/contabil_ia` |
| `VECTORS_DATABASE_URL` | ✅ mesmo que DATABASE_URL |
| `AUTH_SECRET` | ✅ configurado |
| `AUTH_URL` / `NEXTAUTH_URL` | ✅ `https://crm.avos.digital` |
| `ENCRYPTION_KEY` | ✅ configurado |
| `VOYAGE_API_KEY` | ✅ configurado (embeddings RAG) |
| `RESEND_API_KEY` | ✅ configurado |
| `RESEND_FROM` | ✅ `contato@avos.digital` |
| `GOOGLE_CLIENT_ID/SECRET` | ✅ configurados (OAuth) |
| `STORAGE_ENDPOINT` | ✅ Cloudflare R2 |
| `STORAGE_PUBLIC_URL` | ✅ `https://4cfb1c818af7e115e9d9ad185706bc13.r2.cloudflarestorage.com/contabia` |
| `STORAGE_BUCKET_NAME` | ✅ `contabia` |
| `STORAGE_ACCESS_KEY_ID` | ✅ `<STORAGE_ACCESS_KEY_ID>` |
| `CRON_SECRET` | ✅ configurado |
| `VAPID_PRIVATE_KEY` | ✅ configurado |
| `NEXT_PUBLIC_APP_NAME` | ✅ `Avos` |
| `NEXT_PUBLIC_CRM_URL` | ✅ `https://crm.avos.digital` |
| `NEXT_PUBLIC_PORTAL_URL` | ✅ `https://portal.avos.digital` |
| `TZ` | ✅ `America/Sao_Paulo` |
| `ANTHROPIC_API_KEY` | ⚠️ **VAZIA** (chaves de IA ficam no banco via getAiConfig()) |
| `OPENAI_API_KEY` | ⚠️ vazia (idem) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ✅ corrigido em v3.10.10 — push notifications restauradas |
| `NEXT_PUBLIC_SENTRY_DSN` | ✅ corrigido em v3.10.10 — Sentry ativo em produção |
| `DOCUSEAL_API_URL` | ❌ **NÃO ESTÁ NO CONTAINER** — DocuSeal não usado atualmente |
| `DOCUSEAL_API_KEY` | ❌ **NÃO ESTÁ NO CONTAINER** |
| `CLICKSIGN_API_KEY` | vazia |
| `ZAPSIGN_API_TOKEN` | vazia |
| `N8N_CHAT_WEBHOOK_URL` | vazia |

**Por que ANTHROPIC_API_KEY está vazia:** chaves de IA ficam no banco de dados, encriptadas, acessadas via `getAiConfig()`. Não precisam estar no `.env`.

**Por que Sentry/DocuSeal não chegam ao container:** estão no `.env` local mas faltam no `docker-compose.yml` na seção `environment`. Precisam ser adicionados.

---

## DocuSeal

**URL:** `http://82.25.79.193:32825`
**API Key:** `<DOCUSEAL_API_KEY>`
**Template ID:** `1`
**Status:** ⚠️ container não aparece na listagem ativa — pode estar parado

---

## Backups do Banco

**Local:** `/home/deploy/contabai/backups/`
**Formato:** `db-v{versao}-{timestamp}.sql`
**Criados pelo CI** antes de cada deploy, mantém últimos 10.
**Backup mais recente:** `db-v3.10.9-20260402-235305.sql` (390 KB)
**Automação:** ❌ não há cron de backup automático — apenas no deploy

---

## Git na VPS

**Pasta:** `/home/deploy/contabai/`
**Branch:** `main`
**Como funciona o deploy:** via imagens Docker no ghcr.io (CI/CD), **NÃO** `git pull`
**Arquivos modificados localmente (não commitados — risco!):**
- `docker-compose.yml`
- `src/lib/email/imap.ts`

---

## Imagens Docker (tamanho)

| Imagem | Tamanho | Nota |
|---|---|---|
| `ghcr.io/.../contabilai-migrate:v3.10.9` | 1.99 GB | migrator atual |
| `contabai:migrator` | 1.82 GB | — |
| `evoapicloud/evolution-api:latest` | 1.83 GB | rodando |
| `evoapicloud/evolution-api:v2.3.7` | 1.83 GB | backup |
| `atendai/evolution-api:*` (2 imagens) | ~2.74 GB | **14 meses — pode remover** |
| `postgres:15` + `postgres:17` | ~1.27 GB | — |
| `contabai:latest` | 347 MB | app rodando |

**Limpeza disponível:** ~2.7 GB com `docker rmi atendai/evolution-api`

---

## Pipeline CI/CD

1. Tag `v*` → GitHub Actions dispara
2. Build Docker multi-stage → push `ghcr.io/alissonsaraiva/contabilai-migrate:{tag}`
3. SSH na VPS:
   - `pg_dump` → `/home/deploy/contabai/backups/db-{tag}-{timestamp}.sql` (mantém 10)
   - Pull imagens → re-tag como `contabai:latest`
   - `prisma migrate deploy` via container migrator
   - `docker compose up -d --no-deps app`
   - `docker image prune -f`

**Deploy manual de emergência:** `bash /home/deploy/deploy.sh`

---

## ⚠️ Problemas Identificados (2026-04-03)

| # | Problema | Status |
|---|---|---|
| 1 | Sentry DSN não estava no container | ✅ Corrigido v3.10.10 |
| 2 | DocuSeal env vars ausentes | Não usado — ignorado |
| 3 | VAPID_PUBLIC_KEY vazia | ✅ Corrigido v3.10.10 |
| 4 | Porta 32768 (PostgreSQL) exposta | ✅ UFW ativo, porta bloqueada |
| 5 | Erro IMAP `NoConnection` recorrente | ✅ Corrigido em imap.ts (tratamento gracioso) |
| 6 | `docker-compose.yml` e `imap.ts` modificados na VPS sem commit | ✅ Codebase já tinha as mudanças; container reiniciado |
| 7 | Imagens `atendai/evolution-api` (~2.7 GB) | ✅ Removidas — disco 14 GB (era 16 GB) |
| 8 | Tabela `escritorio` vazia | ⚠️ Pendente — preencher via CRM settings |

## 🔥 Firewall (UFW) — ativo desde 2026-04-03

```
22/tcp   ALLOW
80/tcp   ALLOW
443/tcp  ALLOW
32768/tcp DENY  ← PostgreSQL bloqueado externamente
```

**Nota**: Docker usa iptables diretamente e pode bypassar UFW em algumas configurações. Confirmar periodicamente com `nmap -p 32768 82.25.79.193` externamente.
