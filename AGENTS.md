<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Postura

- Ser honesto e direto, nunca agir para agradar. Se algo está errado, dizer. Se errou, admitir. Se não sabe, falar.
- Se a ideia do usuário tem falhas, apontar antes de implementar. Não concordar por conveniência.
- Se a prioridade parece errada, questionar. Se o escopo está grande, avisar.
- Nunca esconder complexidade, risco ou incerteza. Nunca usar linguagem vaga para evitar compromisso.
- O objetivo é evoluir o projeto da melhor forma, não produzir respostas agradáveis.

---

# Idioma

**SEMPRE** responder em português do Brasil.

---

# Protocolo pré-implementação

Antes de qualquer implementação (feature, bug fix, refactor):
1. Reescrever o problema com as próprias palavras
2. Levantar dúvidas, ambiguidades, riscos
3. Definir comportamento esperado (inputs/outputs, sucesso, erro)
4. Propor abordagem técnica
5. **Pedir autorização explícita** antes de codar

Nunca assumir requisito. Se faltar informação, parar e perguntar.

---

# Regras de banco de dados (Prisma)

**NUNCA use `prisma db push` para alterações de schema.**

Use sempre `prisma migrate dev --name <nome_descritivo>`. Isso gera o arquivo `.sql` em `prisma/migrations/` que o CI aplica automaticamente via `prisma migrate deploy`.

`db push` bypass o sistema de migrations — as mudanças ficam invisíveis para o deploy e causam erros P2022 em produção.

Fluxo correto:
1. Alterar `prisma/schema.prisma`
2. `npx prisma migrate dev --name <nome>` — cria o arquivo SQL e aplica localmente
3. Commitar o arquivo gerado em `prisma/migrations/`
4. No deploy, o CI roda `prisma migrate deploy` e aplica automaticamente

---

# Anti-patterns proibidos

1. **Catch vazio** — todo `catch` deve ter log rastreável + `Sentry.captureException` em operações críticas. Tags: `{ module, operation }` + extra com IDs.
2. **Quick fix sem causa raiz** — proibido "consertar sintoma". Identificar causa raiz real com evidência antes de propor solução.
3. **Código sem propósito** — não adicionar features não solicitadas, refactors não pedidos, ou funcionalidades especulativas.
4. **`src/middleware.ts`** — NUNCA criar ou tocar. Usar apenas `src/proxy.ts`. Coexistência causa build error nesta versão do Next.js.
5. **Hardcodar nomes** — nome do produto vem de `getEscritorioConfig()`. Nunca escrever "AVOS" ou "ContabAI" fixo em UI visível.
6. **Onboarding via PUT** — etapas públicas usam `POST /api/onboarding/salvar-progresso`, nunca `PUT /api/leads/:id` (exige auth).
7. **Tool de agente sem avaliar** — antes de criar tool de IA, avaliar se não deveria ser feature fixa (critérios: frequência, criticidade, volume, custo de créditos).

---

# Checklist pré-entrega

**Executar TODOS os itens antes de considerar qualquer tarefa concluída:**

- [ ] `npx tsc --noEmit` — passa sem erros
- [ ] `npm run build` — build completo sem falhas
- [ ] Sentry.captureException em catch blocks de operações críticas (tags: `{ module, operation }`)
- [ ] Logs rastreáveis em todo código novo (zero `catch {}` vazio)
- [ ] Grep pelo mesmo padrão/bug em outros arquivos do `src/` — corrigir se encontrar
- [ ] `docs/` atualizado (arquivo correspondente à feature/módulo alterado)
- [ ] Memórias relevantes atualizadas (se a mudança afeta decisões, arquitetura ou estado)
- [ ] Se **cron**: instrumentar no healthchecks.io (`src/lib/healthchecks.ts` + var `HC_*`) + documentar crontab da VPS
- [ ] Se **schema Prisma**: `prisma migrate dev --name <nome>` — commitar o SQL gerado
- [ ] Se **deploy**: criar tag `v*` (`git tag v3.x.y && git push origin v3.x.y`) — push para main sozinho NÃO dispara CI
- [ ] Se **nova feature com dados**: avaliar indexação no RAG e quais IAs acessam

---

# Documentação

A pasta `docs/` (SISTEMA.md, WHATSAPP.md, features/*) é a **fonte de verdade**.
- Ler o arquivo correspondente antes de alterar qualquer módulo
- Atualizar após qualquer alteração de código, config ou infra
- Nunca deixar para depois

---

# Diagnóstico de bugs

Ao investigar qualquer bug:
1. Consultar `memory/known_issues_patterns.md` — pode ser um padrão já conhecido
2. Identificar causa raiz com evidência concreta antes de propor solução
3. Após corrigir: varrer `src/` procurando o mesmo anti-pattern em outros arquivos
4. Se o bug for novo e significativo: adicionar ao catálogo de padrões

---

# Final de sessão

Ao encerrar uma sessão produtiva, atualizar:
- `memory/progress_log.md` — o que foi feito, pendente, decisões, próximo passo
- `memory/current_state.md` — se houve deploy, feature nova ou mudança de estado
