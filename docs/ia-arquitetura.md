# Arquitetura de IA — ContabAI

> Referência técnica do subsistema de inteligência artificial: providers, RAG, canais, ingestão automática e fluxo de cada IA.
> Última atualização: 2026-03-25

---

## Visão geral

O sistema possui **4 IAs independentes**, cada uma com provider, modelo, system prompt e base de conhecimento configuráveis separadamente pelo CRM. Todas passam pelo mesmo núcleo (`askAI`) e pelo mesmo pipeline RAG, diferenciando-se pelo **canal** e pelo **escopo** da busca.

```
Mensagem do usuário
       │
       ▼
   askAI(opts)
       │
       ├─ 1. getAiConfig()          — lê config do banco (provider, modelo, system prompt por feature)
       ├─ 2. embedText(pergunta)     — Voyage AI gera embedding da pergunta
       ├─ 3. searchSimilar(...)      — busca vetorial filtrada por canal + escopo
       ├─ 4. monta system prompt     — SYSTEM_BASE_DEFAULT (ou prompt do DB) + systemExtra + chunks RAG
       └─ 5. provider.complete(...)  — Claude / OpenAI / Gemini responde
```

---

## As 4 IAs

### 1. IA do Onboarding
| Item | Valor |
|---|---|
| **Feature** | `onboarding` |
| **Canal RAG** | `onboarding` + `geral` |
| **Escopo RAG** | `global` |
| **Endpoint** | `POST /api/onboarding/chat` |
| **Acionada por** | Chat flutuante no fluxo `/onboarding` |

**O que faz:** Conversa com prospects durante o cadastro. Responde dúvidas sobre planos, regime tributário, processo de contratação.

**Fontes de conhecimento:**
- Base de conhecimento manual → canal `onboarding`
- Canal `geral` (sempre incluso) — inclui dados do escritório e planos
- Dados do lead preenchidos nos steps → indexados automaticamente via `indexarLead`

---

### 2. Assistente CRM
| Item | Valor |
|---|---|
| **Feature** | `crm` |
| **Canal RAG** | `crm` + `geral` |
| **Escopo RAG** | `cliente+global` ou `lead+global` |
| **Endpoint** | `POST /api/crm/ai/chat` *(pendente)* |
| **Acionada por** | Chat interno do contador no CRM |

**O que faz:** Auxilia o contador a analisar clientes e leads — histórico de interações, situação tributária, documentos.

**Fontes de conhecimento:**
- Base de conhecimento manual → canal `crm`
- Canal `geral`
- Dados do cliente (CNPJ, regime, plano, valor, vencimento) → `indexarCliente`, escopo `cliente`
- Histórico de interações (notas, emails, ligações, WhatsApp) → `indexarInteracao`, escopo `cliente`

---

### 3. IA do Portal do Cliente
| Item | Valor |
|---|---|
| **Feature** | `portal` |
| **Canal RAG** | `portal` + `geral` |
| **Escopo RAG** | `cliente+global` |
| **Endpoint** | *(pendente — portal em desenvolvimento)* |

**O que faz:** Atende o cliente diretamente. Responde sobre obrigações fiscais, documentos, prazos, DAS, IRPF usando os dados específicos do cliente logado.

**Fontes de conhecimento:**
- Base de conhecimento manual → canal `portal`
- Canal `geral`
- Dados do próprio cliente → `indexarCliente`, escopo `cliente`, canal `portal`

**Não vê:** histórico CRM (notas internas — privacidade intencional).

---

### 4. IA do WhatsApp
| Item | Valor |
|---|---|
| **Feature** | `whatsapp` |
| **Canal RAG** | `whatsapp` + `geral` |
| **Escopo RAG** | varia conforme identificação (ver fluxo abaixo) |
| **Endpoint** | `POST /api/whatsapp/webhook` |
| **Acionada por** | Webhook da Evolution API ao receber mensagem |

**O que faz:** Responde mensagens recebidas. Identifica o contato, personaliza o contexto, e — quando detecta interesse genuíno em contato desconhecido — cria um lead automaticamente via marcador `##LEAD##`.

#### Fluxo de identificação e contexto

```
Mensagem recebida (remoteJid)
         │
         ▼
   phoneCache hit?
   ├─ SIM → usa tipo cached
   └─ NÃO → buscarPorTelefone()
              ├─ clienteId encontrado → tipo: 'cliente'
              ├─ leadId encontrado    → tipo: 'lead'
              └─ nenhum              → tipo: 'desconhecido'

   tipo: 'cliente'     → escopo: 'cliente+global' + systemExtra: "CLIENTE ATIVO"
   tipo: 'lead'        → escopo: 'lead+global'    + systemExtra: "LEAD EM ONBOARDING" | "PROSPECT"
   tipo: 'desconhecido'→ escopo: 'global'          + systemExtra: "PRIMEIRO CONTATO"
```

#### Criação automática de lead via marcador `##LEAD##`

Contatos desconhecidos ficam **apenas no cache em memória** — nenhum lead é criado no banco prematuramente.

O `SYSTEM_BASE_DEFAULT` instrui a IA: quando identificar **interesse genuíno** (pergunta sobre preço, quer abrir empresa, quer declarar IR, intenção de contratar), colocar `##LEAD##` no **início** da resposta.

O webhook então:
1. Remove o marcador antes de enviar (o usuário nunca vê)
2. Chama `criarLeadWhatsApp(remoteJid)` → cria lead com `canal: 'whatsapp'`, `funil: 'prospeccao'`
3. Atualiza o cache para `tipo: 'prospect'`

Mensagens de spam, curiosidade vaga ou assunto não relacionado → **nunca criam lead**.

#### Funis de lead

O lead criado pelo WhatsApp vai para `funil: 'prospeccao'` (não para o onboarding).
A tela de Prospecção (`/crm/prospeccao`) é um **kanban** de contatos comerciais com 4 etapas:
`Novo → Em contato → Qualificado → Proposta enviada`

---

## System Prompt padrão (`SYSTEM_BASE_DEFAULT`)

Arquivo: [`src/lib/ai/ask.ts`](../src/lib/ai/ask.ts)

O prompt padrão é usado quando nenhum system prompt personalizado está configurado no banco. Ele:

- Define **3 perfis de atendimento** com base no campo `systemExtra` injetado pelo webhook:
  - `CLIENTE ATIVO` — atendimento técnico personalizado
  - `LEAD EM ONBOARDING` — foco em avançar nas etapas
  - `PROSPECT / PRIMEIRO CONTATO` — atendimento comercial + instrução do marcador `##LEAD##`
- Aplica para todas as IAs como fallback
- Cada IA pode ter seu próprio system prompt configurado pelo CRM (substitui o padrão)

---

## Pipeline RAG

### Ingestão automática

Fire-and-forget em background após writes no banco — não bloqueia a resposta HTTP:

| Evento | Função | Canal(is) | Escopo |
|---|---|---|---|
| Lead criado | `indexarLead` | `onboarding` | `lead` |
| Lead avança step | `indexarLead` | `onboarding` | `lead` |
| Progresso onboarding salvo | `indexarLead` | `onboarding` | `lead` |
| Cliente criado | `indexarCliente` | `crm` + `portal` + `whatsapp` | `cliente` |
| Lead → cliente (contrato) | `indexarCliente` | `crm` + `portal` + `whatsapp` | `cliente` |
| Interação criada (nota/email/ligação/WhatsApp) | `indexarInteracao` | `crm` | `cliente` ou `lead` |
| Escritório salvo (configurações) | `indexarEscritorio` + `indexarPlanos` | `geral` | `global` |

**Seed inicial / re-sincronização completa:** `POST /api/rag/seed` (admin only)
Re-indexa tudo de uma vez: escritório + planos + todos os clientes + todos os leads ativos.
Botão "Re-indexar dados" em CRM → Configurações → Base de Conhecimento.

Arquivo central: [`src/lib/rag/ingest.ts`](../src/lib/rag/ingest.ts)

### `PLANOS_INFO` — definição canônica dos planos

Exportado de `src/lib/rag/ingest.ts`. Usado tanto pela função `indexarPlanos()` quanto como referência para outros módulos. Contém os 4 planos (essencial, profissional, empresarial, startup) com nome, descrição, faixa de preço e lista de serviços.

### Canais e isolamento

A coluna `canal` na tabela `vectors.embeddings` isola o que cada IA pode ver:

| Canal | Quem acessa |
|---|---|
| `onboarding` | IA do Onboarding |
| `crm` | Assistente CRM |
| `portal` | IA do Portal |
| `whatsapp` | IA do WhatsApp |
| `geral` | **Todas as IAs** (sempre incluso na busca) |

A busca usa `canal IN (canal_solicitado, 'geral')` — nunca vaza contexto entre canais.

### Escopos

| Escopo | Significado |
|---|---|
| `global` | Base de conhecimento manual (artigos, normas, templates, escritório, planos) |
| `lead` | Dados de um lead específico |
| `cliente` | Dados de um cliente específico |
| `cliente+global` | Dados do cliente + base global |
| `lead+global` | Dados do lead + base global |

### Banco de vetores

- **Banco separado:** `vectors` — container `contabai_vectors` (pgvector/pgvector:pg17)
- **Conexão:** `VECTORS_DATABASE_URL`
- **Embeddings:** Voyage AI `voyage-3-lite`, 512 dimensões
- **Tabela:** `vectors.embeddings`
- **Migration canal:** `scripts/migrate-vectors-canal.sql` (necessária se o banco foi criado antes da coluna `canal` ser adicionada)

---

## Providers de IA

Três providers suportados, configuráveis **por feature** (cada IA pode usar um provider diferente):

| Provider | Campos no banco | Arquivo |
|---|---|---|
| Anthropic Claude | `aiProviderX = 'claude'`, `anthropicApiKey` | `src/lib/ai/providers/claude.ts` |
| OpenAI-compatible | `aiProviderX = 'openai'`, `openaiApiKey`, `openaiBaseUrl` | `src/lib/ai/providers/openai.ts` |
| Google Gemini | `aiProviderX = 'google'`, `googleApiKey` | `src/lib/ai/providers/google.ts` |

Google Gemini usa endpoint OpenAI-compat: `https://generativelanguage.googleapis.com/v1beta/openai/`

Todas as chaves são armazenadas **encriptadas** no banco (AES-256-GCM) via `src/lib/crypto.ts`.

### Modelos por feature

Campos no banco (`Escritorio`):

| Campo | Padrão |
|---|---|
| `aiProviderOnboarding` / `aiModelOnboarding` | `claude` / `claude-haiku-4-5-20251001` |
| `aiProviderCrm` / `aiModelCrm` | `claude` / `claude-haiku-4-5-20251001` |
| `aiProviderPortal` / `aiModelPortal` | `claude` / `claude-haiku-4-5-20251001` |
| `aiProviderWhatsapp` / `aiModelWhatsapp` | `claude` / `claude-haiku-4-5-20251001` |

O endpoint `GET /api/configuracoes/ia/models` retorna modelos dos 3 providers de uma só vez — tenta buscar dinamicamente via API do provider (OpenAI `/v1/models`, Google `v1beta/models`), cai no fallback hardcoded se não conseguir.

---

## Configuração via CRM

Caminho: **CRM → Configurações → IA**

- **Aba "Chaves de API":** Anthropic, Voyage, OpenAI (+ Base URL com presets), Google — inserção segura com máscara. Botão "Testar conexão".
- **Aba "Por Funcionalidade":** Para cada uma das 4 IAs: provider (radio, bloqueado se chave não configurada), modelo (select dinâmico) e system prompt.
- System prompt do WhatsApp também acessível em **CRM → Configurações → WhatsApp** (seção "IA no WhatsApp").

---

## Prospecção via WhatsApp

Nova tela: **CRM → Prospecção** (`/crm/prospeccao`)

- Kanban com 4 etapas: Novo / Em contato / Qualificado / Proposta enviada
- Leads com `funil: 'prospeccao'` — originados via WhatsApp (automático pela IA) ou criados manualmente pelo contador ("Novo Prospecto" via drawer)
- Leads do onboarding (`funil: 'onboarding'`) continuam na tela de Leads
- Ao criar lead manualmente, verifica se já existe lead ativo com o mesmo contato no mesmo funil (retoma em vez de duplicar)

---

## Lacunas / próximos passos

| Item | Status |
|---|---|
| Endpoint CRM AI chat | Pendente — `POST /api/crm/ai/chat` |
| Portal do cliente | Pendente — tela + endpoint de chat |
| Histórico de conversa WhatsApp | Não implementado — hoje stateless; persistir últimas N mensagens por número |
| Upload de PDF na base | Não implementado |
| IA autônoma (tool use) | Futuro — emissão de NF, busca de documentos, alertas via function calling |
