---
name: Arquitetura IA + RAG — ContabAI
description: Estado atual completo do sistema de IA: 4 IAs, providers por feature, RAG com canais, ingestão automática, agente operacional com tools
type: project
---

## As 4 IAs

| Feature | Canal RAG | Escopo | Endpoint | Status |
|---|---|---|---|---|
| `onboarding` | `onboarding` + `geral` | `global` | `POST /api/onboarding/chat` | ✅ |
| `crm` | `crm` + `geral` | `cliente+global` / `lead+global` | `POST /api/crm/ai/chat` | ✅ |
| `portal` | `portal` + `geral` | `cliente+global` | pendente | ⏳ pendente |
| `whatsapp` | `whatsapp` + `geral` | varia | `POST /api/whatsapp/webhook` | ✅ |

## Providers — configurável por feature

- Claude, OpenAI-compatible, Google Gemini
- Campos por feature: `aiProviderOnboarding/Crm/Portal/Whatsapp` + `aiModelOnboarding/Crm/Portal/Whatsapp`
- Chaves encriptadas AES-256-GCM no banco
- `GET /api/configuracoes/ia/models` — retorna modelos dos 3 providers (tenta dynamic fetch, fallback hardcoded)

## WhatsApp — fluxo completo

**Identificação:**
1. `buscarPorTelefone()` — normaliza número, busca em Cliente + Lead
2. Cliente → escopo `cliente+global`, systemExtra "CLIENTE ATIVO"
3. Lead → escopo `lead+global`, systemExtra "LEAD EM ONBOARDING" ou "PROSPECT"
4. Desconhecido → escopo `global`, systemExtra "PRIMEIRO CONTATO"

**Criação inteligente de lead via `##LEAD##`:**
- Contatos desconhecidos ficam APENAS no cache — nenhum lead criado prematuramente
- `SYSTEM_BASE_DEFAULT` instrui a IA: ao detectar interesse genuíno, colocar `##LEAD##` no início
- Webhook: remove marcador antes de enviar, cria lead com `canal: 'whatsapp'`, `funil: 'prospeccao'`
- Spam e curiosidade vaga → nunca criam lead

**phoneCache:** Map em memória por `remoteJid`, tipos: `'cliente'` | `'lead'` | `'prospect'` | `'desconhecido'`

## RAG — configuração atual (v3.5, 2026-03-28)

- **Similarity threshold:** 0.72 (store default e ask.ts)
- **Chunk overlap:** 80 tokens
- **Busca:** hybrid search (semântico + BM25/RRF) como padrão em `ask.ts`; fallback para semântico puro se vazio
- **Avaliação:** `GET /api/rag/avaliar` (admin) — side-by-side semântico vs híbrido

## RAG — ingestão automática

| Evento | Função | Canal(is) | Escopo |
|---|---|---|---|
| Lead criado/step/progresso | `indexarLead` | `onboarding` | `lead` |
| Cliente criado / lead→cliente | `indexarCliente` | `crm` + `portal` + `whatsapp` | `cliente` |
| Interação criada | `indexarInteracao` | `crm` | `cliente`/`lead` |
| Escritório salvo | `indexarEscritorio` + `indexarPlanos` | `geral` | `global` |
| OS criada/resolvida | `indexarOrdemServico` | `crm` | `cliente` |
| AgenteAcao bem-sucedida | `indexarAgenteAcao` | `crm` | `cliente`/`lead` |
| AgendamentoAgente ativo | `indexarAgendamento` | `geral` | `global` |

**Seed:** `POST /api/rag/seed` (admin) — re-indexa tudo. Botão na tela de Base de Conhecimento.

**PLANOS_INFO** exportado de `src/lib/rag/ingest.ts` — definição canônica dos 4 planos.

## Prospecção kanban

- Nova tela `/crm/prospeccao` — kanban com 4 etapas (Novo / Em contato / Qualificado / Proposta enviada)
- Leads com `funil: 'prospeccao'` — do WhatsApp (automático via ##LEAD##) ou manual (drawer "Novo Prospecto")
- Leads com `funil: 'onboarding'` continuam na tela de Leads
- Criação de lead verifica duplicata por contato+funil antes de criar

## System prompt padrão

`SYSTEM_BASE_DEFAULT` em `src/lib/ai/ask.ts`:
- Inclui instrução do `##LEAD##` para prospects no WhatsApp
- Perfis: CLIENTE ATIVO / LEAD EM ONBOARDING / PROSPECT
- Substituído pelo system prompt do banco quando configurado

## AssistenteCRM — arquitetura de contexto

- `AssistenteProvider` no layout CRM — exibe o botão flutuante em TODAS as páginas
- `AssistenteContextSetter` — componente invisível que páginas de detalhe renderizam para passar clienteId/leadId/nomeCliente
- Quando contexto muda (troca de cliente/lead), o chat é resetado automaticamente
- Greeting dinâmico: com contexto mostra o nome do cliente; sem contexto, modo escritório geral
- Respostas renderizadas com `react-markdown` + componentes customizados

## Agente Operacional — tools (v3.5.x) ✅

A IA do CRM tem acesso a 38 tools via sistema de tool use com registry. Ver `memory/project_agente_operacional.md` para arquitetura completa.

Permissões por canal: CRM tem acesso total; WhatsApp/Portal/Onboarding têm listas restritas.

Toggle de tools disponível em Configurações → IA → Ferramentas.

## Lacunas pendentes

- Portal do cliente (tela + auth + endpoint `/api/portal/chat`)
  - Quando implementar: persistir histórico via `getOrCreateConversaSession` + injetar histórico WhatsApp do cliente no systemExtra
- Upload de PDF na base de conhecimento
- Missões proativas (contador aciona IA para pedir documento ao cliente)
- Action router para documentos recebidos via WhatsApp (classificar + extrair campos)

**Why:** Dados do escritório e planos agora indexados no RAG (canal geral) — todas as IAs passam a conhecer o escritório e os serviços.
**How to apply:** Ao implementar CRM chat ou portal, usar `escopo: 'cliente+global'` com feature correta. O ##LEAD## só funciona no WhatsApp (webhook detecta o marcador).
