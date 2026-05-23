---
name: RAG Audit v3.10.21 — Melhorias Implementadas
description: Auditoria completa do sistema RAG/IA — v3.5 (2026-03-28) + fix NFS-e cancelamento (2026-04-04)
type: project
---

## Contexto

Auditoria de arquitetura de IA realizada em 2026-03-28 cobrindo: gaps críticos de RAG, melhorias de retrieval, contexto da IA, ferramentas do agente e ingestão de dados.

## Melhorias de RAG implementadas (v3.5 / 2026-03-28)

### Chunking e similarity

| Config | Antes | Depois |
|---|---|---|
| `CHUNK_OVERLAP` | 20 tokens | 80 tokens (~20% do chunk) |
| `minSimilarity` store default | 0.50 | 0.72 |
| `minSimilarity` ask.ts | 0.45 | 0.72 |

### Hybrid Search (RRF)

- Nova função `searchHybrid()` em `src/lib/rag/store.ts`
- Combina: busca semântica (dense) + BM25 via `tsvector` PostgreSQL
- Fusão via Reciprocal Rank Fusion (k=60): `score = Σ 1/(60 + rank + 1)`
- Execução paralela com `Promise.allSettled`
- `ask.ts` usa hybrid como primário, cai para semântico se vazio

### Novo TipoConhecimento

- `'historico_agente'` adicionado em `src/lib/rag/types.ts` e `TIPOS_CLIENTE`
- Indexa ações bem-sucedidas do agente operacional

### Novos ingestores (`src/lib/rag/ingest.ts`)

- `indexarAgenteAcao()` — indexa AgenteAcao com sucesso e resumo > 20 chars como `historico_agente`
- `indexarAgendamento()` — indexa AgendamentoAgente ativo como `base_conhecimento` global; remove quando inativo
- `indexarLead()` — extração dinâmica de todos os campos de `dadosJson` (não mais hardcoded)
- `indexarOrdemServico()` — estendido: inclui `resposta`, `respondidoEm`, `avaliacaoNota`, `avaliacaoComent`

### `src/lib/rag/indexar-async.ts`

Novos tipos suportados: `'agenteAcao'` e `'agendamento'`

## Fix RAG NFS-e — Cancelamento (v3.10.21 / 2026-04-04)

### Gap corrigido

`cancelamento.ts` e `onNotaCancelada` (webhook) nunca re-indexavam o RAG após cancelar uma nota. As IAs continuavam respondendo que a nota estava "Autorizada".

### Correções aplicadas

**`src/lib/rag/ingest-nota-fiscal.ts`:**
- Adicionados campos ao tipo `NotaFiscalData`: `status?: string | null`, `canceladaEm?: Date | null`
- Texto indexado agora inclui: `Status: Autorizada/Cancelada/Rejeitada/Erro interno` e `Data de cancelamento` (quando aplicável)

**`src/lib/services/nfse/cancelamento.ts`:**
- Adicionado `import('@/lib/rag/ingest-nota-fiscal').then(({ indexar }) => ...)` após update Prisma
- Re-indexa com `status: 'cancelada'` e `canceladaEm` imediatamente após cada cancelamento (CRM, portal, agente)

**`src/lib/services/nfse/eventos.ts` — `onNotaCancelada`:**
- Adicionados campos `descricao?`, `protocolo?`, `canceladaEm?` ao tipo do parâmetro
- Chama `indexarNotaFiscalRag` com status atualizado
- Cobre cancelamentos via webhook direto da Spedy (sem passar pelo CRM)

**`src/lib/ai/ask.ts` — `SYSTEM_NFSE_INSTRUCOES_PORTAL`:**
- Adicionada seção "Cancelamento via portal": Clara sabe que o cliente pode cancelar diretamente na UI, prazo de 30 dias, fallback chamado
- Adicionada seção "Reemissão via portal": Clara sabe que notas rejeitadas/erro podem ser reemitidas na UI

## Contexto da IA (ask.ts)

- `AskContext` estendido com `socioNome?` e `socioId?` nos escopos `cliente` e `cliente+global`
- Quando presente, `socioNome` é injetado no system prompt como "Interlocutor atual"

## Email (processar.ts)

- Busca paralela: cliente + OS aberta + últimas 3 interações antes de gerar sugestão
- Injeta no `systemExtra`: nome, plano, status, OS em aberto, último contato
- `maxTokens`: 512 → 768

## Novas tools do agente (v3.5)

| Tool | Categoria | O que faz |
|---|---|---|
| `listarDocumentosPendentes` | Documentos | Lista docs com status pendente/solicitado, agrupado por cliente, com diasAberto |
| `classificarEmail` | Email | Classifica urgência+tipo via heurística (keywords), fallback IA; persiste em metadados |
| `enviarComunicadoSegmentado` | Comunicação | Segmenta clientes por status/plano/regime/vencimento; envia portal e/ou WhatsApp |

## Novo endpoint de avaliação

`GET /api/rag/avaliar?q=<query>&canal=<canal>&clienteId=<id>&limite=<n>`

- Admin/contador only
- Executa semântico + híbrido em paralelo
- Retorna side-by-side com análise de sobreposição e `ganhoHibrido` (chunks só via BM25)

## Why

Cobertura de RAG estava com gaps críticos: dados de lead hardcoded, OS sem resolução/avaliação, agente sem memória de ações, similarity threshold baixo gerando ruído, sem busca keyword para termos técnicos (CNPJ, DAS, etc.). Nota cancelada continuava indexada como "Autorizada".

**How to apply:** Configurações de similarity e chunk overlap são globais. Hybrid search é o padrão em `ask.ts`. Para qualquer nova fonte de dados, avaliar indexação via `/api/rag/avaliar`. Ao implementar features que mudam status de entidades indexadas no RAG, SEMPRE adicionar re-indexação no caminho de mutação.
