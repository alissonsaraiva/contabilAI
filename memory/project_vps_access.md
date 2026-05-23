---
name: project_vps_access
description: Guia completo de acesso à VPS — containers, banco, logs, comandos corretos — evita retrabalho toda sessão
type: project
---

# Acesso à VPS — Referência Definitiva

**Host:** `deploy@82.25.79.193`
**SSH:** `ssh -o StrictHostKeyChecking=no deploy@82.25.79.193`

---

## Containers Docker

```
contabai_app                     → aplicação Next.js (porta 3000)
traefik-zq71-traefik-1           → reverse proxy
postgresql-4cnu-postgresql-1     → PostgreSQL principal (porta externa 32768)
evolution-api-swhw-api-1         → Evolution API WhatsApp (porta externa 42572)
evolution-api-swhw-postgres-1    → PostgreSQL da Evolution
evolution-api-swhw-redis-1       → Redis da Evolution
```

Listar containers:
```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

---

## PostgreSQL — acesso correto

**Config:** `/docker/postgresql-4cnu/.env`
```
POSTGRES_USER=<POSTGRES_USER>
POSTGRES_PASSWORD=<POSTGRES_PASSWORD>
POSTGRES_DB=GU7ryn2OpPoWo3jP   ← banco padrão vazio, NÃO é o do app
```

**Banco da aplicação:** `contabil_ia` (não `GU7ryn2OpPoWo3jP`)

**Padrão correto de acesso via docker exec:**
```bash
docker exec postgresql-4cnu-postgresql-1 bash -c \
  "PGPASSWORD=<POSTGRES_PASSWORD> psql -U <POSTGRES_USER> contabil_ia -c 'SELECT ...;'"
```

**Erros comuns e por quê falham:**
- `psql` direto no host → `psql: command not found` (não instalado na VPS)
- `docker exec ... psql -U postgres` → `role "postgres" does not exist`
- `docker exec ... psql -U root` → `role "root" does not exist`
- `docker exec ... psql ... GU7ryn2OpPoWo3jP` → banco vazio, sem tabelas
- `psql -h localhost -p 32768` → `psql: command not found` no host

---

## Nomes das tabelas (IMPORTANTE)

As tabelas no PostgreSQL são **snake_case**, mesmo que o schema Prisma use PascalCase.

| Prisma Model | Tabela real no DB |
|---|---|
| `Escritorio` | `escritorio` |
| `Cliente` | `clientes` |
| `Socio` | `socios` |
| `Usuario` | `usuarios` |
| `Contrato` | `contratos` |
| `ConversaIA` | `conversas_ia` |
| `MensagemIA` | `mensagens_ia` |
| `Escalacao` | `escalacoes` |
| `Lead` | `leads` |
| `Interacao` | `interacoes` |

> **Confirmar nome real:** `\dt` no psql lista todas as tabelas. Nunca assumir — PascalCase (`"ConversaIA"`) causa `relation does not exist`.

**Usar sem aspas no psql (tabelas snake_case):**
```sql
-- correto:
SELECT * FROM conversas_ia LIMIT 1;
SELECT * FROM mensagens_ia WHERE "conversaId" = 'uuid' LIMIT 5;

-- errado (causa "relation does not exist"):
SELECT * FROM "ConversaIA" LIMIT 1;
```

**Colunas camelCase precisam de aspas duplas:**
```sql
SELECT "remoteJid", "clienteId", "pausadaEm", "atualizadaEm" FROM conversas_ia LIMIT 1;
SELECT "conversaId", "criadaEm", role, conteudo, status FROM mensagens_ia LIMIT 5;
```

**Padrão correto — psql direto no container (sem bash -c, evita problemas de escape):**
```bash
# ← USAR ESTE PADRÃO — mais simples e sem erro de escape
ssh deploy@82.25.79.193 "docker exec postgresql-4cnu-postgresql-1 psql -U <POSTGRES_USER> contabil_ia -c 'SELECT id, canal, LEFT(\"remoteJid\",25) as jid, \"clienteId\" IS NOT NULL as tem_cliente, \"pausadaEm\" IS NOT NULL as pausada, \"atualizadaEm\" FROM conversas_ia WHERE canal='"'"'whatsapp'"'"' ORDER BY \"atualizadaEm\" DESC LIMIT 5;'"

# bash -c também funciona mas requer escape duplo — evitar quando possível:
docker exec postgresql-4cnu-postgresql-1 bash -c \
  "PGPASSWORD=<POSTGRES_PASSWORD> psql -U <POSTGRES_USER> contabil_ia \
  -c 'SELECT \"evolutionApiUrl\", \"evolutionInstance\" FROM escritorio LIMIT 1;'"
```

**Erros comuns de escape (registrados em 2026-04-13):**

| Erro | Causa | Solução |
|------|-------|---------|
| `unexpected EOF while looking for matching` | `bash -c "... 'query'" ` com aspas simples dentro de aspas duplas sem escape | Usar `psql` direto no container sem `bash -c`, ou usar `'"'"'` para aspas simples |
| `syntax error at or near "\"` | `bash -c` com `\` antes de aspas no ssh aninhado | Usar `psql` direto, não `bash -c` via ssh |
| `relation "ConversaIA" does not exist` | Tabela em PascalCase — não existe, é `conversas_ia` | Confirmar com `\dt` e usar snake_case |
| `column "remote_jid" does not exist` | Coluna em snake_case — é `remoteJid` com camelCase | Usar `"remoteJid"` com aspas duplas |

---

## Variáveis de ambiente do app

O app **não tem `.env` em `/home/deploy/contabai/`** — as variáveis estão no docker-compose/runtime.

Para ler as env vars do container:
```bash
docker inspect contabai_app | python3 -c \
  "import sys,json; cfg=json.load(sys.stdin)[0]; [print(e) for e in cfg['Config']['Env']]"
```

Para filtrar:
```bash
docker inspect contabai_app | python3 -c \
  "import sys,json; cfg=json.load(sys.stdin)[0]; [print(e) for e in cfg['Config']['Env'] if 'DATABASE' in e or 'EVOLUTION' in e]"
```

**DATABASE_URL do app:**
```
postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgresql-4cnu-postgresql-1:5432/contabil_ia
```

---

## Logs do app

```bash
# Logs recentes (últimas 2h), filtrando ruído:
docker logs contabai_app --since=2h 2>&1 | grep -v 'Server Action\|SENTRY\|at ignore\|function\|vars\|AsyncLocal\|processTicksAndRejections'

# Buscar erros específicos:
docker logs contabai_app 2>&1 | grep -iE 'evolution|circuit|erro|falhou|warn' | tail -30

# Logs em tempo real:
docker logs contabai_app -f 2>&1
```

**Ruído frequente nos logs** (ignorar — não são erros reais):
- `Failed to find Server Action "x"` — cliente com build antigo, inofensivo
- `__SENTRY_ERROR_LOCAL_VARIABLES__` — blocos de stack trace do Sentry

---

## Evolution API

**URL externa:** `https://evolution-api-swhw.srv1524170.hstgr.cloud`
**Porta interna:** `8080`
**Porta externa:** `42572`
**Instância configurada:** `avos`

**Configuração armazenada no banco** (não em env vars do app):
```sql
SELECT "evolutionApiUrl", "evolutionInstance", LEFT("evolutionApiKey", 10) as key_prefix
FROM escritorio LIMIT 1;
```

**Testar conectividade da Evolution API:**
```bash
curl -s -o /dev/null -w '%{http_code} %{time_total}s' \
  'https://evolution-api-swhw.srv1524170.hstgr.cloud/instance/fetchInstances' \
  -H 'apikey: test'
# Esperado: 401 (não autorizado mas API está de pé)
# Se timeout/0: API fora do ar
```

---

## Arquivos importantes na VPS

```
/home/deploy/contabai/          → codebase do app (git clone)
/docker/postgresql-4cnu/.env    → credenciais do PostgreSQL
/docker/evolution-api-swhw/.env → config da Evolution API
/docker/traefik-zq71/.env       → config do Traefik
```

---

## Consultas SQL úteis

```bash
# Template base (copiar e substituir a query):
docker exec postgresql-4cnu-postgresql-1 bash -c \
  "PGPASSWORD=<POSTGRES_PASSWORD> psql -U <POSTGRES_USER> contabil_ia -c 'QUERY AQUI'"

# Listar tabelas:
... -c 'SELECT tablename FROM pg_tables ORDER BY tablename;'

# Ver configuração do escritório:
... -c 'SELECT "evolutionApiUrl", "evolutionInstance", "whatsappAiEnabled" FROM escritorio LIMIT 1;'

# Contar registros:
... -c 'SELECT COUNT(*) FROM clientes;'
```

## Consultas WhatsApp — diagnóstico de conversas

```bash
BASE="ssh -o StrictHostKeyChecking=no deploy@82.25.79.193 docker exec postgresql-4cnu-postgresql-1 psql -U <POSTGRES_USER> contabil_ia -c"

# Conversas WhatsApp mais recentes — ver quem está ativo e pausado
$BASE 'SELECT id, LEFT("remoteJid",25) as jid, "clienteId" IS NOT NULL as tem_cliente, "socioId" IS NOT NULL as tem_socio, "pausadaEm" IS NOT NULL as pausada, "atualizadaEm", (SELECT COUNT(*) FROM mensagens_ia WHERE "conversaId"=c.id) as msgs FROM conversas_ia c WHERE canal='"'"'whatsapp'"'"' ORDER BY "atualizadaEm" DESC LIMIT 10;'

# Múltiplas conversas de um mesmo cliente — detectar problema de ordenação
$BASE 'SELECT id, LEFT("remoteJid",25) as jid, "criadaEm", "atualizadaEm", (SELECT COUNT(*) FROM mensagens_ia WHERE "conversaId"=c.id) as msgs FROM conversas_ia c WHERE "clienteId"='"'"'UUID_AQUI'"'"' ORDER BY "criadaEm" ASC;'

# Mensagens recentes de uma conversa — confirmar que estão no banco
$BASE 'SELECT id, role, LEFT(conteudo,40) as conteudo, status, "criadaEm" FROM mensagens_ia WHERE "conversaId"='"'"'UUID_AQUI'"'"' ORDER BY "criadaEm" DESC LIMIT 10;'

# Resumo de mensagens por conversa de um cliente — detectar ordering bug
$BASE 'SELECT "conversaId", MIN("criadaEm") as primeira, MAX("criadaEm") as ultima, COUNT(*) as total FROM mensagens_ia WHERE "conversaId" IN (SELECT id FROM conversas_ia WHERE "clienteId"='"'"'UUID_AQUI'"'"') GROUP BY "conversaId" ORDER BY MIN("criadaEm");'
```

> **Diagnóstico de ordering bug:** Se um cliente tem múltiplas conversas e a última mensagem do dia está em uma conversa criada ANTES de outra conversa com mensagens mais antigas, o flatmap sem sort global vai exibir as mensagens recentes no meio do histórico e as antigas no fundo. Verificar com a query de "Resumo por conversa" acima.

## Verificar versão deployada

```bash
# Imagem atual e data de build
ssh deploy@82.25.79.193 "docker images contabai --format '{{.Tag}}\t{{.CreatedAt}}\t{{.Size}}'"

# Container está rodando processo único (não cluster)
ssh deploy@82.25.79.193 "docker exec contabai_app ps aux"
# Esperado: apenas 'next-server (v...) PID 1' — processo único, EventBus in-memory funciona

# Logs do app (filtrando ruído do Sentry)
ssh deploy@82.25.79.193 "docker logs contabai_app --since=1h 2>&1 | grep -v 'Server Action\|SENTRY\|at ignore\|__SENTRY' | tail -50"
```
