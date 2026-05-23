---
name: feedback_pre_deploy_checks
description: Checklist obrigatório antes de todo deploy — build, TypeScript e migrations. Deploys quebram quase sempre por erros evitáveis.
type: feedback
---

Antes de qualquer commit que vai para deploy, obrigatoriamente executar:

```bash
npx tsc --noEmit          # type check completo
npm run build             # ou next build — pega erros de prerender/Suspense
```

**Why:** Deploys têm quebrado repetidamente por erros que o type check local teria pego antes de chegar no CI. Cada quebra gera um ciclo de fix → tag → push → aguardar CI desnecessário.

**How to apply:**
- Rodar `npx tsc --noEmit` antes de todo commit de código novo
- Rodar `npm run build` antes de commits que adicionam páginas, layouts ou componentes novos
- Só criar a tag de deploy após build local passar sem erros
- Erros comuns neste projeto a checar:
  - `useSearchParams()` sem `<Suspense>` em page components
  - Props inexistentes em componentes UI (ex: `asChild` no Button local)
  - Imports de funções que não existem (ex: `formatCurrency` em vez de `formatBRL`)
  - Arquivos `.ts` sem `export {}` quando não têm exports reais
  - Campos novos do Prisma sem migration correspondente

---

## Checklist de Migrations (OBRIGATÓRIO quando há mudança no schema Prisma)

Toda vez que o schema.prisma for alterado (novo model, nova coluna, novo enum, renomeação), verificar:

### 1. Diff schema vs migrations
Garantir que **cada campo novo no schema tem migration correspondente**:
```bash
# Ver o que mudou no schema desde o último commit
git diff HEAD prisma/schema.prisma

# Listar todas as migrations existentes
ls prisma/migrations/
```

### 2. Para cada campo/tabela/enum novo no schema, criar migration manual:
```sql
-- Nova coluna nullable
ALTER TABLE "tabela" ADD COLUMN IF NOT EXISTS "coluna" TEXT;

-- Nova coluna com default
ALTER TABLE "tabela" ADD COLUMN IF NOT EXISTS "coluna" BOOLEAN NOT NULL DEFAULT false;

-- Novo valor em enum PostgreSQL
ALTER TYPE "NomeEnum" ADD VALUE IF NOT EXISTS 'novo_valor';

-- Nova tabela → gerar com prisma migrate dev --name descricao (local) ou escrever CREATE TABLE manualmente
```

### 3. Convencão de nomes das migrations neste projeto:
`YYYYMMDDHHMMSS_descricao_curta/migration.sql`
Ex: `20260326200000_escalacao_conversa_ia_id/migration.sql`

### 4. Verificar no banco da VPS pós-deploy:
```bash
ssh deploy@82.25.79.193 "docker exec postgresql-4cnu-postgresql-1 psql -U <POSTGRES_USER> -d contabil_ia -c 'SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;'"
```

### 5. Se a migration não foi aplicada (P2022 / column not found):
- Criar migration corretiva com `ADD COLUMN IF NOT EXISTS`
- Commitar + nova tag → CI aplica automaticamente via `prisma migrate deploy`

**Por que isso importa:** O Prisma client é gerado com base no schema no momento do build. Se o schema tem `conversaIAId` mas o banco não tem a coluna, qualquer query naquele model explode com P2022, derrubando a rota inteira com 404.
