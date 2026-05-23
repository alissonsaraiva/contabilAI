---
name: feedback_prisma_migrations
description: Regra obrigatória para alterações de schema Prisma — nunca db push, sempre migrate dev
type: feedback
---

Nunca usar `prisma db push` para alterações de schema em desenvolvimento.

**Why:** `db push` aplica as mudanças localmente mas não gera arquivo de migration. O CI roda `prisma migrate deploy` que depende dos arquivos em `prisma/migrations/`. Sem o arquivo, a migration não é aplicada em produção, causando erros P2022 ("column does not exist") imediatamente após o deploy.

**How to apply:** Sempre que o schema.prisma for alterado:
1. `npx prisma migrate dev --name <nome_descritivo>` — cria o `.sql` e aplica localmente
2. Commitar o arquivo gerado em `prisma/migrations/`
3. O CI aplica automaticamente no deploy via `prisma migrate deploy`

`db push` só é aceitável em ambientes descartáveis (ex: previews/testes isolados), nunca no fluxo principal de desenvolvimento.
