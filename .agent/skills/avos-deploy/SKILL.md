---
name: deploy
description: Deploy, publicar versão, criar tag, subir para produção, git tag, CI/CD, lançar release — fluxo completo do AVOS. Usar sempre que o usuário quiser fazer deploy, publicar, lançar versão ou subir código para produção.
allowed-tools: Bash, Read
---

# AVOS — Fluxo de Deploy

> **REGRA FUNDAMENTAL:** Push para `main` sozinho **NÃO dispara CI/deploy**.
> O deploy é acionado APENAS por tag `v*`:
> ```bash
> git tag v3.X.Y && git push origin v3.X.Y
> ```

---

## Etapa 0 — Estado antes de começar

```bash
# Verificar tag atual e commits pendentes de deploy
git tag --sort=-v:refname | head -3
git log --oneline -5
git status
```

Se houver arquivos modificados não commitados: decidir se entram no deploy (commitar) ou ficam de fora (stash/descartar).

---

## Etapa 1 — Checklist pré-deploy

Executar **TODOS** os itens. Nenhum é opcional.

### 1.1 TypeScript sem erros
```bash
npx tsc --noEmit
```
Zero erros. Qualquer erro trava o CI — melhor descobrir antes.

### 1.2 Build completo
```bash
npm run build
```
Zero erros. Warnings são tolerados, erros não.

### 1.3 ESLint limpo
```bash
npx eslint src/ --max-warnings=0
```
Regras ativas como `error` (bloqueiam):
- `no-empty` (allowEmptyCatch: false) — catch vazio é bug
- `@typescript-eslint/no-floating-promises` — promise solta é bug

Grep rápido de catch vazios:
```bash
grep -rn "catch {}" src/ --include="*.ts" --include="*.tsx"
```
Exceção válida **com comentário obrigatório**:
```ts
// eslint-disable-next-line no-empty -- controller já fechado se cliente desconectou
try { controller.enqueue(...) } catch {}
```

### 1.4 Schema Prisma (se alterado)
```bash
# NUNCA:
# npx prisma db push

# SEMPRE:
npx prisma migrate dev --name <nome_descritivo>
git add prisma/migrations/
git commit -m "feat(db): <descrição da migration>"
```

### 1.5 Novos crons (se criado)
- Adicionar `HC_*` em `src/lib/healthchecks.ts`
- Configurar na VPS: `ssh deploy@82.25.79.193 "crontab -e"`

### 1.6 Documentação
- `docs/` — arquivo da feature/módulo alterado
- `.claude/projects/.../memory/current_state.md` — versão + o que entrou
- `.claude/projects/.../memory/progress_log.md` — sessão documentada

---

## Etapa 2 — Commit e tag

```bash
# Commitar tudo que deve ir no deploy
git add <arquivos>
git commit -m "tipo(escopo): descrição"

# Garantir que está no main e em sync
git push origin main

# Incrementar versão (ver regra abaixo) e criar tag
git tag v3.X.Y
git push origin v3.X.Y
```

### Regra de versionamento (versão atual: verificar com `git tag --sort=-v:refname | head -1`)

| Tipo de mudança | Incrementar |
|---|---|
| Bug fix / melhoria pequena | patch → v3.10.**X** |
| Feature nova / refactor significativo | minor → v3.**X**.0 |
| Mudança breaking / arquitetural | major → **vX**.0.0 |

---

## Etapa 3 — Acompanhar o CI

O pipeline dispara automaticamente ao receber a tag. Acesse:
```
https://github.com/alissonsaraiva/contabilAI/actions
```

**O que o CI faz (em ordem):**
1. Build Docker multi-stage → push `ghcr.io/alissonsaraiva/contabilai-migrate:{tag}` + `ghcr.io/alissonsaraiva/contabilai:{tag}`
2. SSH na VPS:
   - `pg_dump` → `/home/deploy/contabai/backups/db-{tag}-{timestamp}.sql` (mantém 10)
   - `docker pull` das imagens buildadas
   - `docker tag ... contabai:latest`
   - `prisma migrate deploy` via container migrator
   - Inicializa schema `vectors.embeddings` (pgvector, idempotente)
   - `docker compose up -d --no-deps app`
   - Prune de imagens antigas

**Tempo estimado:** 8–15 minutos (build Next.js é lento).

---

## Etapa 4 — Verificação pós-deploy

### 4.1 Versão deployada na VPS
```bash
ssh deploy@82.25.79.193 "docker images contabai --format '{{.Tag}}\t{{.CreatedAt}}\t{{.Size}}'"
```

### 4.2 App rodando sem erros
```bash
ssh deploy@82.25.79.193 "docker logs contabai_app --since=10m 2>&1 | grep -v 'Server Action\|SENTRY\|at ignore\|__SENTRY' | tail -40"
```

### 4.3 Migrations aplicadas
```bash
ssh deploy@82.25.79.193 "docker exec postgresql-4cnu-postgresql-1 psql -U Mff5dGrSBI3NASY7 contabil_ia -c 'SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;'"
```

### 4.4 Sentry — sem exceções novas
No Sentry (org: `alisson-sb`, projeto: `avos`): verificar se a nova versão não introduziu issues novos nos primeiros 5 minutos.

### 4.5 Healthchecks.io
Crons devem continuar pingando normalmente: processar-pendentes (5s), agente/cron (1min), retry-documentos (1h), email/sync (2min).

### 4.6 Testar fluxos críticos
- [ ] Login CRM funciona
- [ ] Lista de clientes carrega
- [ ] WhatsApp envia/recebe (se alterado)
- [ ] Portal do cliente abre

---

## Rollback de emergência

### Opção A — Novo deploy com código anterior (preferível)
```bash
# Reverter o último commit (se foi o problema)
git revert HEAD
git push origin main
git tag v3.X.Y-hotfix
git push origin v3.X.Y-hotfix
# CI vai buildar e deployar o código revertido
```

### Opção B — Restaurar imagem anterior na VPS (mais rápido)
```bash
ssh deploy@82.25.79.193

# Ver imagens disponíveis
docker images ghcr.io/alissonsaraiva/contabilai --format '{{.Tag}}\t{{.CreatedAt}}'

# Reativar versão anterior (ex: v3.10.64)
docker tag ghcr.io/alissonsaraiva/contabilai:v3.10.64 contabai:latest
cd /home/deploy/contabai
docker compose up -d --no-deps app
docker logs contabai_app -f --since=1m
```

### Opção C — Restaurar banco (se migration quebrou dados)
```bash
ssh deploy@82.25.79.193

# Ver backups disponíveis
ls -lh /home/deploy/contabai/backups/

# Restaurar (DESTRUTIVO — parar app antes)
docker compose -f /home/deploy/contabai/docker-compose.yml stop app
docker exec postgresql-4cnu-postgresql-1 bash -c \
  "PGPASSWORD=2fMiCFTSYkpt1yXw7czALvdusy10pqWO psql -U Mff5dGrSBI3NASY7 contabil_ia" \
  < /home/deploy/contabai/backups/db-v3.X.Y-TIMESTAMP.sql
```

---

## Diagnóstico rápido VPS

```bash
# Todos os containers rodando?
ssh deploy@82.25.79.193 "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

# App está respondendo?
curl -s -o /dev/null -w '%{http_code}' https://crm.avos.digital/api/health

# Logs de erro dos últimos 30 min
ssh deploy@82.25.79.193 "docker logs contabai_app --since=30m 2>&1 | grep -iE 'error|falhou|exception|ECONNREFUSED' | tail -20"

# Uso de disco (alerta se >80%)
ssh deploy@82.25.79.193 "df -h / | tail -1"
```

---

## Referências

- **VPS:** `deploy@82.25.79.193` | Hostinger Ubuntu 24.04 | 48 GB disco
- **App:** `contabai_app` → porta 3000 → Traefik → `crm.avos.digital`
- **BD:** `postgresql-4cnu-postgresql-1` → banco `contabil_ia`
- **CI:** `.github/workflows/deploy.yml` — build Docker multi-stage + SSH deploy
- **Backups:** `/home/deploy/contabai/backups/` (criados pelo CI, mantém 10)
- **VPS infra detalhada:** `memory/project_vps_infra.md`
- **Acesso BD e logs:** `memory/project_vps_access.md`
