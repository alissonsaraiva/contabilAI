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
   - **Exceção documentada (SSE streams):** `controller.enqueue/close` pode lançar se o cliente já desconectou — catch vazio é válido, mas DEVE ter comentário:
     ```ts
     // eslint-disable-next-line no-empty -- controller já fechado se cliente desconectou
     try { controller.enqueue(enc.encode(`data: ...\n\n`)) } catch {}
     ```
2. **Quick fix sem causa raiz** — proibido "consertar sintoma". Identificar causa raiz real com evidência antes de propor solução.
3. **Código sem propósito** — não adicionar features não solicitadas, refactors não pedidos, ou funcionalidades especulativas.
4. **`src/middleware.ts`** — NUNCA criar ou tocar. Usar apenas `src/proxy.ts`. Coexistência causa build error nesta versão do Next.js.
5. **Hardcodar nomes** — nome do produto vem de `getEscritorioConfig()`. Nunca escrever "AVOS" ou "ContabAI" fixo em UI visível.
6. **Onboarding via PUT** — etapas públicas usam `POST /api/onboarding/salvar-progresso`, nunca `PUT /api/leads/:id` (exige auth).
7. **Tool de agente sem avaliar** — antes de criar tool de IA, avaliar se não deveria ser feature fixa (critérios: frequência, criticidade, volume, custo de créditos).
8. **Promise solta** — `@typescript-eslint/no-floating-promises` está como `error`. Toda chamada async fire-and-forget usa `void`:
   ```ts
   // errado
   load()
   setInterval(load, 30_000)
   // correto
   void load()
   setInterval(() => void load(), 30_000)
   ```
9. **Indexação sem guarda** — `noUncheckedIndexedAccess` está ativo. Acesso a `string[i]` ou `array[i]` retorna `T | undefined`. Usar `.charAt(i)`, `.at(i)`, optional chaining, ou type assertion com evidência de que o índice existe.

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

# Mapa de Módulos Críticos

Ao tocar qualquer módulo abaixo, verificar **obrigatoriamente** os outros do mesmo grupo.
Esses vínculos são baseados em bugs reais que se repetiram por falta desta verificação.

---

## Grupo 1 — Chat WhatsApp (finally blocks + GET/POST alignment)

**Arquivos principais:**
- `src/app/(crm)/crm/atendimentos/_components/conversa-rodape.tsx`
- `src/components/crm/whatsapp-chat/use-whatsapp-chat.ts`
- `src/lib/whatsapp/pipeline/` (todos os arquivos)
- `src/app/api/clientes/[id]/whatsapp/route.ts`
- `src/app/api/socios/[id]/whatsapp/route.ts`

**Regras:**
- Qualquer ação de "atualizar UI após envio" DEVE estar no `finally`, nunca só no `try`.
- As rotas GET e POST de WhatsApp DEVEM usar o mesmo critério para determinar `conversaAtual` (`orderBy: atualizadaEm desc`). Se um mudar, o outro muda junto.
- **Histórico:** v3.10.43 (finally em rodapé), v3.10.45 (GET/POST mismatch + finally em use-whatsapp-chat)

---

## Grupo 2 — Chat Portal (SSE + tipos de mensagem + finally blocks)

**Arquivos principais:**
- `src/components/crm/portal-conversa-panel.tsx`
- `src/components/portal/portal-clara.tsx`
- `src/app/api/stream/conversas/[id]/route.ts`
- `src/app/api/stream/portal/conversa/route.ts`
- `src/app/api/portal/chat/route.ts` (GET — selecionar campos de mídia)
- `src/app/api/crm/ai/chat/route.ts`

**Regras:**
- Condições SSE (`if (data.role && data.conteudo)`) nunca devem testar `conteudo` como boolean — mensagens com arquivo têm `conteudo = ''`.
- Tipos de mensagem em qualquer chat (`Mensagem`, `Msg`, etc.) SEMPRE precisam incluir campos de mídia: `mediaUrl`, `mediaType`, `mediaFileName`.
- Se um stream SSE muda estrutura de payload, verificar todos os consumidores desse stream.
- Qualquer `fetch` de envio: refresh/reload vai no `finally`.
- **Histórico:** v3.10.44 (arquivos não renderizavam), v3.10.45 (finally em portal-conversa-panel)

---

## Grupo 3 — NFS-e (finally blocks em todas as ações)

**Arquivos principais:**
- `src/components/crm/notas-fiscais-tab.tsx`
- `src/app/api/crm/notas-fiscais/route.ts`
- `src/app/api/portal/notas-fiscais/route.ts`
- `src/lib/ai/tools/emitir-nota-fiscal.ts`
- `src/lib/ai/tools/cancelar-nota-fiscal.ts`
- `src/lib/ai/tools/reemitir-nota-fiscal.ts`
- `src/lib/ai/tools/reenviar-email-nota-fiscal.ts`

**Regras:**
- As três ações (emitir, cancelar, reemitir) DEVEM ter estrutura simétrica de try/catch/finally.
- `fetchNotas(true)` (ou equivalente refresh) DEVE estar no `finally` das três ações.
- Ao adicionar nova ação de NFS-e, replicar o padrão das existentes.
- **Histórico:** v3.10.45 (finally adicionado em emitir/cancelar/reemitir)

---

## Grupo 4 — RAG CRUD (deleções devem limpar embeddings)

**Arquivos principais:**
- `src/lib/rag/store.ts` (`deleteEmbeddings`, `deleteBySourceId`)
- Qualquer rota DELETE de: clientes, leads, documentos, relatórios, comunicados
- `src/lib/ai/tools/` — tools que criam/deletam entidades

**Regras:**
- Toda deleção de entidade que tem embeddings no RAG DEVE chamar `deleteEmbeddings()` ou `deleteBySourceId()`.
- Esse `deleteEmbeddings` DEVE estar num try/catch com log — falha silenciosa deixa dados órfãos no pgvector.
- Ao criar nova entidade indexada no RAG, registrar aqui e garantir que o DELETE correspondente limpa.
- **Histórico:** v3.10.46 (catch vazios em deleteEmbeddings silenciavam falhas de limpeza)

---

## Grupo 5 — SSE Streams (escalações + portal)

**Arquivos principais:**
- `src/app/api/stream/escalacoes/[id]/route.ts`
- `src/app/api/stream/conversas/[id]/route.ts`
- `src/app/api/stream/portal/conversa/route.ts`

**Regras:**
- `controller.enqueue/close` em streams SSE pode lançar se o cliente já desconectou — catch vazio é **aceitável** nesses pontos específicos (é exceção documentada no AGENTS.md).
- Qualquer mudança no formato do evento SSE (`data: {...}`) exige atualizar TODOS os consumidores (componentes que fazem `new EventSource(...)`).
- Ao adicionar novo campo ao evento, verificar se o consumer valida presença do campo antes de usar.

---

## Grupo 6 — WhatsApp remoteJid (formato brasileiro 8 vs 9 dígitos)

**Arquivos principais:**
- `src/app/api/conversas/[id]/mensagens/[mensagemId]/route.ts` (delete message)
- `src/lib/evolution.ts` (deleteMessage, sendText, sendMedia)
- Qualquer código que compare ou use `remoteJid` de fontes diferentes

**Regras:**
- **NUNCA assumir que `conversa.remoteJid` === `waKey.remoteJid`.** Números brasileiros podem ter formato diferente: conversa armazena `5585981186338` (com o 9) mas a Evolution API retorna key com `558581186338` (sem o 9).
- Operações que referenciam uma **mensagem específica** (delete, reply, react) DEVEM usar o `remoteJid` da key original, não da conversa.
- A Evolution API aceita o REVOKE com JID errado e retorna 201 sucesso — a falha é silenciosa no WhatsApp.
- **Histórico:** v3.10.63 (deleteMessage usava conversa.remoteJid → REVOKE ignorado silenciosamente)

---

> **Manutenção:** Ao encontrar um bug cruzado que não está mapeado aqui, adicionar o grupo novo após resolver. O mapa é evidência — só entra o que já causou problema real.

---

# Final de sessão

Ao encerrar uma sessão produtiva, atualizar:
- `memory/progress_log.md` — o que foi feito, pendente, decisões, próximo passo
- `memory/current_state.md` — se houve deploy, feature nova ou mudança de estado
