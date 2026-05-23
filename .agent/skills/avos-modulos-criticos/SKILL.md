---
name: avos-modulos-criticos
description: Mapa dos 5 grupos de módulos críticos do AVOS com regras de dependência cruzada. Usar ao tocar WhatsApp chat, portal chat, NFS-e, RAG CRUD ou SSE streams.
allowed-tools: Read, Glob, Grep
---

# AVOS — Mapa de Módulos Críticos

> Ao tocar qualquer módulo abaixo, verificar **obrigatoriamente** os outros do mesmo grupo.
> Esses vínculos são baseados em bugs reais que se repetiram por falta dessa verificação.

---

## Grupo 1 — Chat WhatsApp (finally blocks + GET/POST alignment)

**Arquivos principais:**
- `src/app/(crm)/crm/atendimentos/_components/conversa-rodape.tsx`
- `src/components/crm/whatsapp-chat/use-whatsapp-chat.ts`
- `src/lib/whatsapp/pipeline/` (todos)
- `src/app/api/clientes/[id]/whatsapp/route.ts`
- `src/app/api/socios/[id]/whatsapp/route.ts`

**Regras:**
- Qualquer "atualizar UI após envio" DEVE estar no `finally`, nunca só no `try`.
- Rotas GET e POST de WhatsApp DEVEM usar o mesmo critério para `conversaAtual` (`orderBy: atualizadaEm desc`). Se um mudar, o outro muda junto.

**Histórico:** v3.10.43 (finally em rodapé), v3.10.45 (GET/POST mismatch + finally em use-whatsapp-chat)

---

## Grupo 2 — Chat Portal (SSE + tipos de mensagem + finally blocks)

**Arquivos principais:**
- `src/components/crm/portal-conversa-panel.tsx`
- `src/components/portal/portal-clara.tsx`
- `src/app/api/stream/conversas/[id]/route.ts`
- `src/app/api/stream/portal/conversa/route.ts`
- `src/app/api/portal/chat/route.ts`
- `src/app/api/crm/ai/chat/route.ts`

**Regras:**
- Condições SSE (`if (data.role && data.conteudo)`) NUNCA testam `conteudo` como boolean — mensagens com arquivo têm `conteudo = ''`.
- Tipos de mensagem (`Mensagem`, `Msg`) SEMPRE incluem: `mediaUrl`, `mediaType`, `mediaFileName`.
- Se um stream SSE muda estrutura de payload, verificar TODOS os consumidores desse stream.
- Qualquer `fetch` de envio: refresh/reload vai no `finally`.

**Histórico:** v3.10.44 (arquivos não renderizavam), v3.10.45 (finally em portal-conversa-panel)

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
- `fetchNotas(true)` (ou refresh equivalente) DEVE estar no `finally` das três ações.
- Ao adicionar nova ação NFS-e, replicar o padrão das existentes antes de escrever código novo.

**Histórico:** v3.10.45 (finally adicionado em emitir/cancelar/reemitir)

---

## Grupo 4 — RAG CRUD (deleções devem limpar embeddings)

**Arquivos principais:**
- `src/lib/rag/store.ts` (`deleteEmbeddings`, `deleteBySourceId`)
- Qualquer rota DELETE de: clientes, leads, documentos, relatórios, comunicados
- `src/lib/ai/tools/` — tools que criam/deletam entidades

**Regras:**
- Toda deleção de entidade com embeddings no RAG DEVE chamar `deleteEmbeddings()` ou `deleteBySourceId()`.
- Esse `deleteEmbeddings` DEVE estar em try/catch com log — falha silenciosa deixa dados órfãos no pgvector.
- Ao criar nova entidade indexada no RAG, registrar neste grupo e garantir que o DELETE correspondente limpa.

**Histórico:** v3.10.46 (catch vazios em deleteEmbeddings silenciavam falhas de limpeza)

---

## Grupo 5 — SSE Streams (escalações + portal)

**Arquivos principais:**
- `src/app/api/stream/escalacoes/[id]/route.ts`
- `src/app/api/stream/conversas/[id]/route.ts`
- `src/app/api/stream/portal/conversa/route.ts`

**Regras:**
- `controller.enqueue/close` pode lançar se o cliente já desconectou — catch vazio é **aceitável** nesses pontos específicos. DEVE ter comentário:
  ```ts
  // eslint-disable-next-line no-empty -- controller já fechado se cliente desconectou
  try { controller.enqueue(enc.encode(`data: ...\n\n`)) } catch {}
  ```
- Mudança no formato do evento SSE exige atualizar TODOS os consumidores (`new EventSource(...)`).
- Ao adicionar novo campo ao evento, verificar se o consumer valida presença do campo antes de usar.

---

## Checklist ao abrir um arquivo de qualquer grupo

```markdown
- [ ] Identifiquei a qual grupo este arquivo pertence?
- [ ] Consultei os outros arquivos do mesmo grupo?
- [ ] As regras específicas do grupo estão sendo respeitadas?
- [ ] Se alterei estrutura de dados (SSE payload, tipos), propagei para todos os consumidores?
- [ ] O padrão finally/refresh está presente em todas as ações de envio?
```
