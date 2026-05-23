---
name: RAG-first para novas funcionalidades
description: Toda nova funcionalidade ou alteração deve avaliar inserção no RAG e quais IAs devem ter acesso
type: feedback
---

Sempre que uma nova funcionalidade for criada ou uma existente for alterada, antes de finalizar a implementação:

1. **Avaliar se os dados gerados devem ser indexados no RAG** — se o dado é informação sobre o escritório, cliente, lead, interação ou qualquer entidade que uma IA possa precisar consultar, ele deve ser indexado.

2. **Decidir em quais canais indexar** — cada canal isola o que cada IA vê:
   - `geral` → todas as IAs
   - `crm` → contador (Assistente CRM)
   - `portal` → cliente logado (IA do Portal)
   - `whatsapp` → contatos via WhatsApp
   - `onboarding` → leads no fluxo de cadastro

3. **Definir o escopo** — `global` (base de conhecimento), `cliente` (dados de um cliente específico), `lead` (dados de um lead específico).

4. **Implementar fire-and-forget** — a ingestão no RAG nunca deve bloquear a resposta HTTP. Usar `import('@/lib/rag/ingest').then(...).catch(() => {})`.

**Why:** As IAs e a base de conhecimento são o coração da operação. Se um dado novo não entra no RAG, as IAs ficam cegas para ele — mesmo que esteja no banco.

**How to apply:** Em todo PR/feature que cria ou altera dados persistidos, verificar explicitamente: "essa informação deve estar acessível para alguma IA?" Se sim, implementar a ingestão junto com a feature, não depois.

**Checklist obrigatório ao finalizar qualquer feature:**
- [ ] O dado novo entra em qual entity do Prisma?
- [ ] Existe `indexarX` correspondente em `src/lib/rag/ingest.ts`? Se não, criar.
- [ ] O tipo existe em `TipoIndexacao` em `indexar-async.ts`? Se não, adicionar.
- [ ] O route/service que persiste o dado chama `indexarAsync(...)` fire-and-forget?
- [ ] Verificar se o portal também cria/altera o mesmo dado — se sim, indexar lá também.

**Gaps encontrados em 2026-03-28:** `indexarDocumento` e `indexarOrdemServico` não existiam em `ingest.ts` — docs e OS criados desde o início não estavam no RAG. Corrigido na mesma data.
