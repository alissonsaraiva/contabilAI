<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Regras de banco de dados (Prisma)

**NUNCA use `prisma db push` para alterações de schema.**

Use sempre `prisma migrate dev --name <nome_descritivo>`. Isso gera o arquivo `.sql` em `prisma/migrations/` que o CI aplica automaticamente via `prisma migrate deploy`.

`db push` bypass o sistema de migrations — as mudanças ficam invisíveis para o deploy e causam erros P2022 em produção.

Fluxo correto:
1. Alterar `prisma/schema.prisma`
2. `npx prisma migrate dev --name <nome>` — cria o arquivo SQL e aplica localmente
3. Commitar o arquivo gerado em `prisma/migrations/`
4. No deploy, o CI roda `prisma migrate deploy` e aplica automaticamente
