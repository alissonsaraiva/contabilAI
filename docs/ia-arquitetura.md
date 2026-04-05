# Arquitetura de IA — AVOS

> Referência técnica do subsistema de inteligência artificial: providers, RAG, canais, ingestão automática e fluxo de cada IA.
> Última atualização: 2026-04-04 (v3.10.23 — 64 tools, NFS-e, Asaas/financeiro, portal auto-serviço, WhatsApp security)

---

## Visão geral

O sistema possui **4 IAs independentes**, cada uma com provider, modelo, system prompt e base de conhecimento configuráveis separadamente pelo CRM. Todas passam pelo mesmo núcleo (`askAI`) e pelo mesmo pipeline RAG, diferenciando-se pelo **canal** e pelo **escopo** da busca.

```
Mensagem do usuário
       │
       ▼
   askAI(opts)
       │
       ├─ 1. getAiConfig()           — lê config do banco (provider, modelo, system prompt por feature)
       ├─ 2. embedText(pergunta)      — OpenAI text-embedding-3-small (512d MRL) ou Voyage fallback
       ├─ 3. searchHybrid(...)        — dense (cosine) + BM25 → RRF (k=60) — top-8 chunks
       │     └─ thresholds dinâmicos: fiscal_normativo=0.72 / base_conhecimento=0.65 / historico_crm=0.55
       ├─ 4. classificarIntencao()    — decide: pergunta (RAG) ou ação (agente)
       ├─ 5. monta system prompt      — base + guardrails + capacidades + systemExtra + chunks RAG
       └─ 6. provider.complete(...)   — Claude / OpenAI / Gemini com fallback automático
```

---

## As 4 IAs

### 1. IA do Onboarding
| Item | Valor |
|---|---|
| **Feature** | `onboarding` |
| **Canal RAG** | `onboarding` + `geral` |
| **Escopo RAG** | `lead+global` (quando leadId presente) ou `global` |
| **Endpoint** | `POST /api/onboarding/chat` |
| **Acionada por** | Chat flutuante no fluxo `/onboarding` |

**O que faz:** Conversa com prospects durante o cadastro. Responde dúvidas sobre planos, regime tributário, processo de contratação. Detecta escalação para humano via marcador `##HUMANO##`.

**Fontes de conhecimento:**
- Base de conhecimento manual → canal `onboarding`
- Canal `geral` (sempre incluso) — inclui dados do escritório e planos
- Dados do lead preenchidos nos steps → indexados automaticamente via `indexarLead`
- Histórico de conversa persistido em banco (tabela `mensagens_ia`, session por `sessionId`)

**Contexto injetado (systemExtra):**
Todos os campos do `dadosJson` (formulário dinâmico) são injetados no `systemExtra`, incluindo:
nome, CPF, CNPJ, razão social, e-mail, telefone, regime tributário, cidade, atividade principal,
plano de interesse, status no fluxo, canal de entrada, observações e campos customizados.

**Fluxo de sessão:**
- O widget extrai `leadId` da URL (query param) via `useSearchParams`
- Envia `{ message, sessionId, leadId }` no body
- O endpoint cria/recupera `ConversaIA` via `getOrCreateConversaSession(sessionId, 'onboarding', { leadId })`
- Histórico carregado do banco e passado para `askAI`

---

### 2. Assistente CRM
| Item | Valor |
|---|---|
| **Feature** | `crm` |
| **Canal RAG** | `crm` + `geral` |
| **Escopo RAG** | `cliente+global` ou `lead+global` |
| **Endpoint** | `POST /api/crm/ai/chat` |
| **Acionada por** | Botão flutuante `smart_toy` na página de detalhe do cliente/lead |

**O que faz:** Auxilia o contador a analisar clientes e leads — histórico completo de todas as interações em todos os canais, situação tributária, documentos. **É a IA com maior escopo de todas.**

**Fontes de conhecimento:**
- Base de conhecimento manual → canal `crm`
- Canal `geral`
- Dados do cliente (CNPJ, regime, plano, valor, vencimento) → `indexarCliente`, escopo `cliente`
- Histórico de interações (notas, emails enviados/recebidos, ligações, WhatsApp) → `indexarInteracao`, escopo `cliente`
- **Emails recebidos do cliente** — indexados como `email_recebido` com corpo e assunto
- **Histórico de conversas de todos os canais** — últimas 100 mensagens de `mensagens_ia` (WhatsApp, Portal, Onboarding, CRM) injetadas como `systemExtra`
- Histórico da sessão CRM atual persistido em banco

**Contexto cross-canal injetado:**
```
systemExtra = "HISTÓRICO DE CONVERSAS DO CLIENTE (todos os canais — últimas mensagens):
Cliente (whatsapp): ...
Clara (whatsapp): ...
Cliente (portal): ...
Clara (portal): ..."
```

**UI:** Componente `AssistenteCRM` — painel lateral deslizante (max-w-sm) com botão flutuante fixo no canto inferior direito.

---

### 3. IA do Portal do Cliente
| Item | Valor |
|---|---|
| **Feature** | `portal` |
| **Canal RAG** | `portal` + `geral` |
| **Escopo RAG** | `cliente+global` |
| **Endpoint** | `POST /api/portal/chat` |

**O que faz:** Atende o cliente diretamente no portal. Responde sobre obrigações fiscais, documentos, prazos, DAS, IRPF usando os dados específicos do cliente logado.

**Fontes de conhecimento:**
- Base de conhecimento manual → canal `portal`
- Canal `geral`
- Dados do próprio cliente → `indexarCliente`, escopo `cliente`, canal `portal`
- Emails e documentos enviados pelo escritório → `indexarInteracao` com `TIPOS_CRM_E_PORTAL` (indexados em `crm` E `portal` simultaneamente)

**Não vê:** notas internas, ligações, mensagens de WhatsApp internas (privacidade intencional).

**Tipos de interação por canal:**
```
TIPOS_SOMENTE_CRM    = ['nota_interna', 'ligacao', 'whatsapp_enviado']
TIPOS_CRM_E_PORTAL   = ['email_enviado', 'email_recebido', 'documento_enviado']
```

> `email_recebido` é visível no portal pois representa uma mensagem que o próprio cliente enviou.

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
   ├─ SIM → usa tipo cached + conversaId cached
   └─ NÃO → buscarPorTelefone()
              ├─ clienteId encontrado → tipo: 'cliente'
              ├─ leadId encontrado    → tipo: 'lead'
              └─ nenhum              → tipo: 'desconhecido'

   tipo: 'cliente'     → escopo: 'cliente+global' + systemExtra: "CLIENTE ATIVO"
   tipo: 'lead'        → escopo: 'lead+global'    + systemExtra: "LEAD EM ONBOARDING" | "PROSPECT"
   tipo: 'desconhecido'→ escopo: 'global'          + systemExtra: "PRIMEIRO CONTATO"
```

#### Gerenciamento de sessão (24h window)

- Cada número (`remoteJid`) possui uma `ConversaIA` ativa no banco
- Janela de 24h: se a última mensagem foi há mais de 24h, uma nova conversa é criada
- `getOrCreateConversaWhatsapp(remoteJid, opts)` — busca conversa ativa ou cria nova
- `conversaId` é cacheado em `phoneCache` para evitar queries repetidas
- Histórico carregado do banco (`getHistorico`) e passado para `askAI` — conversa não é mais stateless

#### Criação automática de lead via marcador `##LEAD##`

Contatos desconhecidos ficam apenas no cache em memória — nenhum lead é criado no banco prematuramente.

O `SYSTEM_BASE_DEFAULT` instrui a IA: quando identificar **interesse genuíno** (pergunta sobre preço, quer abrir empresa, quer declarar IR, intenção de contratar), colocar `##LEAD##` no **início** da resposta.

O webhook então:
1. Remove o marcador antes de enviar (o usuário nunca vê)
2. Chama `criarLeadWhatsApp(remoteJid)` → cria lead com `canal: 'whatsapp'`, `funil: 'prospeccao'`
3. Atualiza o cache para `tipo: 'prospect'`
4. Chama `atualizarIdentidadeConversa(conversaId, { leadId })` para vincular a conversa ao novo lead

Mensagens de spam, curiosidade vaga ou assunto não relacionado → **nunca criam lead**.

#### Funis de lead

O lead criado pelo WhatsApp vai para `funil: 'prospeccao'` (não para o onboarding).
A tela de Prospecção (`/crm/prospeccao`) é um **kanban** de contatos comerciais com 4 etapas:
`Novo → Em contato → Qualificado → Proposta enviada`

---

## Memória de Conversas

### Modelos Prisma

```prisma
model ConversaIA {
  id            String       @id @default(uuid())
  canal         String       // 'whatsapp' | 'onboarding' | 'crm' | 'portal'
  clienteId     String?
  leadId        String?
  socioId       String?      // sócio que iniciou a conversa (portal/WhatsApp)
  empresaId     String?      // empresa do sócio ou do cliente (portal)
  remoteJid     String?      // WhatsApp: número do contato
  sessionId     String?      // Web chats: UUID gerado no front-end
  pausadaEm     DateTime?    // quando preenchido, IA para de responder (humano no controle)
  pausadoPorId  String?      // userId de quem assumiu
  criadaEm      DateTime     @default(now())
  atualizadaEm  DateTime     @updatedAt
  mensagens     MensagemIA[]
}

model MensagemIA {
  id              String    @id @default(uuid())
  conversaId      String
  role            String    // 'user' | 'assistant'
  conteudo        String    @db.Text
  status          String?   // 'sent' | 'failed' | 'pending'
  tentativas      Int       @default(0)
  erroEnvio       String?
  mediaUrl        String?   // URL pública do arquivo (S3/R2)
  mediaType       String?   // 'image' | 'document' | 'audio'
  mediaFileName   String?   // nome original do arquivo
  mediaMimeType   String?   // MIME type
  whatsappMsgData Json?     // payload {key, message} para re-fetch de áudio na Evolution
  excluido        Boolean   @default(false)
  criadaEm        DateTime  @default(now())
}
```

### Helper central: `src/lib/ai/conversa.ts`

| Função | Uso |
|---|---|
| `getOrCreateConversaWhatsapp(remoteJid, opts?)` | WhatsApp — janela de 24h por número |
| `getOrCreateConversaSession(sessionId, canal, opts?)` | Web chats — recupera ou cria por sessionId |
| `atualizarIdentidadeConversa(conversaId, opts)` | Vincula clienteId/leadId quando contato é identificado |
| `getHistorico(conversaId, limit=20)` | Últimas N mensagens de uma conversa específica |
| `addMensagens(conversaId, user, assistant)` | Persiste par user+assistant (fire-and-forget) |
| `limparConversasAntigas()` | Deleta conversas com `atualizadaEm < 90 dias` — dispara ao criar nova conversa |

### Retenção

- **90 dias** — conversas mais antigas são removidas automaticamente (lazy cleanup)
- Cleanup fire-and-forget: dispara em background a cada nova `ConversaIA` criada, sem bloquear o fluxo

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

**Persona:** Clara — assistente contábil. Mesma persona em todos os canais (WhatsApp, Onboarding, Portal, CRM).

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
| Cliente atualizado (PUT) | `indexarCliente` | `crm` + `portal` + `whatsapp` | `cliente` |
| Lead → cliente (contrato) | `indexarCliente` | `crm` + `portal` + `whatsapp` | `cliente` |
| Interação criada (nota/ligação/whatsapp) | `indexarInteracao` | `crm` | `cliente` ou `lead` |
| Interação criada (email enviado/recebido/documento) | `indexarInteracao` | `crm` **e** `portal` | `cliente` ou `lead` |
| Email enviado pelo contador | `POST /api/email/enviar` → `indexarInteracao` | `crm` + `portal` | `cliente` ou `lead` |
| Email recebido do cliente (IMAP polling) | `processarEmailRecebido` → `indexarInteracao` | `crm` + `portal` | `cliente` ou `lead` |
| Anexo recebido por email | upload S3 → cria `Documento` → `indexarInteracao` | `crm` + `portal` | `cliente` ou `lead` |
| Chamado criado/atualizado | `indexarChamado` | `crm` ou `geral` | `cliente` |
| Chamado resolvido (PATCH multipart) | `indexarChamado` (via `resolverChamado`) | `geral` | `cliente` |
| Comunicado publicado | `indexarComunicado` | `geral` | `global` |
| Comunicado despublicado | remove do índice | — | — |
| Escalação resolvida | `indexarEscalacao` (inclui resolução) | `crm` ou `geral` | `cliente`/`lead` |
| Relatório publicado pelo agente | `indexarRelatorio` | `crm` | `global` |
| Ação do agente (tool sucesso) | `indexarAgenteAcao` | `crm` | `cliente`/`lead` |
| Conversa pausada (humano assume) | `indexarConversa` | canal origem | `cliente`/`lead` |
| Status do cliente alterado | `indexarStatusHistorico` | `geral` | `cliente` |
| Contrato assinado | `indexarContrato` | `onboarding` | `lead` |
| Documento enviado/recebido | `indexarDocumento` | `geral` ou `crm` | `cliente`/`lead` |
| NFS-e autorizada | `indexarNotaFiscal` | `geral` | `cliente` |
| NFS-e cancelada | `indexarNotaFiscal` (re-indexa com status cancelada) | `geral` | `cliente` |
| Configurações de IA salvas (PUT) | `indexarEscritorio` + `indexarPlanos` | `geral` | `global` |
| Artigo criado na base de conhecimento | `ingestirTexto` | canal configurado | `global` |
| Upload de PDF na base de conhecimento | `/api/conhecimento/pdf` → `ingestirTexto` | canal configurado | `global` |

**Seed inicial / re-sincronização completa:** `POST /api/rag/seed` (admin only)
Re-indexa tudo de uma vez: escritório + planos + todos os clientes + todos os leads ativos.
Botão "Re-indexar dados" em CRM → Configurações → Base de Conhecimento.

Arquivo central: [`src/lib/rag/ingest.ts`](../src/lib/rag/ingest.ts)

### Upload de PDF

Endpoint: `POST /api/conhecimento/pdf`

- Aceita `multipart/form-data`: `file` (PDF), `titulo`, `canal`, `tipo`
- Extrai texto via `pdf-parse`
- Chunking + embedding + armazenamento com `escopo: 'global'`
- Metadata inclui: `originalFilename`, `pages`, `titulo`, `tipo`
- Auth: admin ou contador
- Retorna: `{ ok, sourceId, chunks, pages, chars }`

UI: CRM → Configurações → Base de Conhecimento → botão "Upload PDF"

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

## Email bidirecional

### Visão geral

O sistema gerencia email de entrada e saída diretamente, usando a conta de email da Hostinger configurada pelo escritório. Todo email enviado ou recebido é automaticamente:
1. Salvo como `Interacao` no banco
2. Indexado no RAG (`crm` + `portal`)
3. Visível no histórico do cliente

### Envio

- **Endpoint:** `POST /api/email/enviar`
- **Lib:** [`src/lib/email/send.ts`](../src/lib/email/send.ts) — Nodemailer + SMTP Hostinger (`smtp.hostinger.com:587`)
- **UI:** `EnviarEmailDrawer` — botão "Enviar e-mail" na página do cliente
  - Campos: Para, Assunto, Corpo
  - Seleção de documentos já existentes do cliente como anexos (buscados da tabela `Documento`)
- **Persistência:** salva como `email_enviado` com `metadados: { para, assunto, messageId, status, anexos }`

### Recebimento

- **Polling IMAP:** a cada 2 minutos via `src/instrumentation.ts` (scheduler no startup do servidor)
- **Lib:** [`src/lib/email/imap.ts`](../src/lib/email/imap.ts) — ImapFlow + IMAP Hostinger (`imap.hostinger.com:993`)
  - Busca emails não lidos (`seen: false`)
  - Parseia com `mailparser` (texto, HTML, anexos)
  - Marca como lido após processar
- **Endpoint de sync:** `POST /api/email/sync` — protegido por `CRON_SECRET`
- **Processamento:** [`src/lib/email/processar.ts`](../src/lib/email/processar.ts)

#### Fluxo de processamento

```
Email recebido (IMAP)
        │
        ▼
  identificarRemetente(email)
  ├─ cliente.email match    → clienteId
  ├─ lead.dadosJson.email   → leadId
  ├─ lead.contatoEntrada    → leadId
  └─ nenhum                 → sem vínculo (caixa de entrada geral)
        │
        ▼
  Upload anexos → S3 → Documento (se associado)
        │
        ▼
  gerarSugestao() → askAI (feature: 'crm', escopo: 'cliente+global')
        │
        ▼
  salva Interacao { tipo: 'email_recebido', metadados: { de, assunto, sugestao, anexos } }
        │
        ▼
  indexarInteracao → RAG (crm + portal)  ← fire-and-forget, somente se associado
```

#### Emails de remetentes não identificados

- São salvos com `clienteId: null, leadId: null`
- Aparecerão em uma seção "Caixa de entrada" (a implementar na UI)
- Sem sugestão de resposta (sem contexto de cliente)
- O contador pode associar manualmente ao cliente correto

### Sugestão de resposta da Clara

Quando um email é recebido de um cliente/lead identificado, a Clara analisa o conteúdo e gera automaticamente uma sugestão de resposta usando `askAI` com o contexto completo do cliente.

A sugestão fica armazenada em `metadados.sugestao` e é exibida inline no histórico do cliente com o badge `smart_toy — Sugestão de resposta da Clara`. O contador pode:
1. Usar como base e editar no `EnviarEmailDrawer`
2. Copiar e enviar diretamente
3. Ignorar e escrever do zero

### Configuração

**CRM → Configurações → Contato → seção "E-mail de envio (SMTP Hostinger)"**
- `emailRemetente` — ex: `contato@escritorio.com.br`
- `emailNome` — nome exibido no remetente
- `emailSenha` — senha da conta Hostinger (armazenada encriptada via AES-256-GCM)
- Botão "Testar conexão" → `POST /api/configuracoes/email` → `testarConexaoSmtp()`

**Variáveis de ambiente (fallback):**
```
EMAIL_REMETENTE=contato@escritorio.com.br
EMAIL_SENHA=...
EMAIL_NOME=Escritório Contábil
CRON_SECRET=...   # protege o endpoint /api/email/sync
```

### Impacto nos prompts

O **Assistente CRM** já recebe `email_recebido` automaticamente via RAG e via `systemExtra` cross-canal. Recomenda-se adicionar ao system prompt configurado:

> "Quando o histórico incluir emails recebidos do cliente (email_recebido), analise o assunto e conteúdo para enriquecer sua resposta. Se houver sugestão de resposta gerada, o contador pode usá-la como base para responder diretamente pelo sistema."

---

---

## Feature: Arquivos do Sistema como Anexo

> Implementado em v3.7+ — permite anexar documentos já salvos no sistema (tabela `Documento`) em qualquer ponto de envio, sem re-upload.

### Componente central: `DocumentoPicker`

**Arquivo:** `src/components/crm/documento-picker.tsx`

Modal reutilizável para seleção de documentos existentes no banco.

```tsx
<DocumentoPicker
  open={pickerOpen}
  onClose={() => setPickerOpen(false)}
  onSelect={(doc: DocSistema) => { /* usa doc.url, doc.nome, etc. */ }}
  clienteId="uuid"   // contexto automático: carrega docs do cliente
  leadId="uuid"      // OU contexto de lead
  // sem clienteId/leadId → busca livre cross-client (exige 2+ chars)
/>
```

**Comportamento:**
- Com `clienteId` ou `leadId`: carrega documentos automaticamente, busca filtrada
- Sem contexto: campo de busca livre por nome, tipo ou cliente (mínimo 2 caracteres)
- Filtros: categoria, texto livre (debounce 350ms)
- Para clientes PJ: inclui automaticamente documentos da empresa vinculada

### Endpoint: `GET /api/crm/documentos`

**Arquivo:** `src/app/api/crm/documentos/route.ts`

Busca genérica de documentos para o picker.

| Param | Descrição |
|---|---|
| `clienteId` | Docs do cliente + empresa vinculada (PJ) |
| `leadId` | Docs do lead |
| `empresaId` | Docs da empresa |
| `search` | Filtro textual (nome, tipo, cliente) |
| `categoria` | Filtro de categoria |

Sem contexto, exige `search` com 2+ caracteres.

### Pontos de integração

| Onde | Como | Arquivo |
|---|---|---|
| **Email (página do cliente)** | Drawer auto-fetch com busca + checkboxes múltiplos | `enviar-email-drawer.tsx` + `clientes/[id]/page.tsx` |
| **Chat/Conversa** | Botão `folder_open` ao lado do `attach_file` | `conversa-rodape.tsx` |
| **Escalação WhatsApp** | Botão `folder_open` no modo direto (WhatsApp) | `escalacao-responder.tsx` |
| **OS Responder** | Botões "Fazer upload" / "Do sistema" | `os-responder-form.tsx` |
| **Comunicados** | Opções "Fazer upload" / "Do sistema" | `comunicado-form.tsx` |

### Fluxo de documento existente na OS

1. Usuário clica "Do sistema" → `DocumentoPicker` abre com docs do cliente
2. Seleciona doc → form envia `documento_id`, `documento_url`, `documento_nome`, `documento_mime` no FormData
3. Route PATCH `/api/crm/chamados/[id]` extrai os campos e monta `documentoExistente`
4. `resolverChamado()` usa a URL existente (sem upload) para envio por email/WhatsApp
5. Vincula o `Documento` existente ao chamado via `update({ ordemServicoId })`

### Fluxo de documento existente no Comunicado

FormData aceita `anexo_url` + `anexo_nome` como alternativa ao `File`. O route de comunicados salva diretamente `anexoUrl` e `anexoNome` sem upload, reutilizando a URL do S3.

---

## Agente Operacional (CRM)

O Assistente CRM opera em modo agêntico: além de responder perguntas via RAG, pode **executar ações** no sistema usando um loop de tool use.

### Loop agêntico (`executarAgente`)

Arquivo: [`src/lib/ai/agent.ts`](../src/lib/ai/agent.ts)

```
pergunta do operador
       │
       ▼
  classificarIntencao()   — pergunta (vai direto pro RAG) ou ação (entra no loop)
       │
       ▼  (se ação)
  loop (máx 5 iterações):
    ├─ provider.complete(tools=[...64 tools...])
    ├─ tool_use? → executar tool → resultado → próxima iteração
    └─ stop_reason=end_turn → resposta final
       │
       ▼
  salvarAuditoria() → AgenteAcao (tabela de audit trail)
  indexarAsync('agenteAcao', ...) → RAG feedback loop (tool sucesso)
```

### Registro de tools

- **Registry global:** `src/lib/ai/tools/registry.ts` — `Map<string, Tool>`
- **Ponto de entrada:** `src/lib/ai/tools/index.ts` — registra todas as 64 tools via side-effect de import
- **Permissões por canal:** cada tool declara `meta.canais: string[]` — filtrado em runtime

### 64 Tools implementadas

#### Leitura CRM (7)
| Tool | Descrição |
|---|---|
| `buscarDadosOperador` | Dados do operador logado + permissões |
| `resumirFunil` | Resumo do funil de leads com contagens por status |
| `listarLeadsInativos` | Leads sem interação há N dias |
| `buscarDadosCliente` | Ficha completa do cliente (dados cadastrais + plano + empresa) |
| `buscarHistorico` | Histórico de interações (notas, emails, WhatsApp, ligações) |
| `listarPlanos` | Planos ativos com valores e serviços |
| `resumoDashboard` | Métricas do dashboard: clientes, leads, OS |

#### Escrita CRM (10)
| Tool | Descrição |
|---|---|
| `criarChamado` | Cria chamado vinculado ao cliente |
| `registrarInteracao` | Registra nota/ligação/interação no histórico |
| `atualizarStatusLead` | Atualiza status de um lead no funil |
| `avancarLead` | Avança lead para a próxima etapa do onboarding |
| `criarLead` | Cria novo lead (onboarding ou prospecção) |
| `criarCliente` | Converte lead em cliente |
| `convidarSocioPortal` | Convida sócio para acessar o portal |
| `atualizarDadosCliente` | Atualiza telefone, email, WhatsApp, endereço, vencimento, responsável + re-indexa RAG |
| `transferirCliente` | Transfere cliente/lead para outro responsável + registra interação + re-indexa |
| `reativarCliente` | Reativa cliente cancelado/suspenso e registra no histórico |

#### Comunicação (10)
| Tool | Descrição |
|---|---|
| `enviarEmail` | Envia email para cliente/lead via SMTP |
| `listarEmailsPendentes` | Emails sem resposta aguardando ação |
| `enviarWhatsappCliente` | Envia mensagem WhatsApp para cliente |
| `enviarWhatsappLead` | Envia mensagem WhatsApp para lead |
| `enviarWhatsappSocio` | Envia mensagem WhatsApp para sócio |
| `responderEscalacao` | Responde escalação aberta (human-in-the-loop) |
| `buscarDocumentos` | Busca documentos do cliente por tipo/categoria |
| `enviarDocumentoWhatsapp` | Envia documento existente por WhatsApp |
| `enviarLembreteVencimento` | Envia lembrete de vencimento por email e/ou WhatsApp (cliente específico ou lote) |
| `buscarEmailInbox` | Busca emails recebidos por remetente, assunto, período ou cliente |

#### Contrato (3)
| Tool | Descrição |
|---|---|
| `gerarContrato` | Gera contrato de prestação de serviços (DocuSeal) |
| `enviarContrato` | Envia contrato para assinatura eletrônica |
| `verificarStatusContrato` | Verifica status de assinatura no DocuSeal |

#### Agendamento (3)
| Tool | Descrição |
|---|---|
| `criarAgendamento` | Cria agendamento com cliente |
| `listarAgendamentos` | Lista agendamentos futuros |
| `cancelarAgendamento` | Cancela agendamento |

#### Consultas e relatórios (3)
| Tool | Descrição |
|---|---|
| `consultarDados` | Consulta genérica de dados do CRM via filtros |
| `publicarRelatorio` | Publica relatório no painel do cliente (portal) |
| `gerarRelatorioInadimplencia` | Aging report (≤30d, 31-60d, 61-90d, >90d) dos clientes inadimplentes |

#### Financeiras — Asaas / inadimplência (7)
| Tool | Descrição |
|---|---|
| `buscarCobrancaAberta` | Busca cobranças em aberto do cliente no Asaas |
| `enviarCobrancaInadimplente` | Envia cobrança/lembrete para cliente inadimplente |
| `gerarSegundaViaAsaas` | Gera segunda via de boleto/PIX via Asaas |
| `listarCobrancasCliente` | Lista histórico de cobranças do cliente |
| `alterarVencimentoCobranca` | Altera data de vencimento de uma cobrança aberta |
| `alterarFormaPagamento` | Altera forma de pagamento recorrente do cliente |
| `extratoFinanceiro` | Extrato financeiro do cliente (pagas, abertas, vencidas) |

#### Portal do cliente (6)
| Tool | Descrição |
|---|---|
| `buscarChamado` | Busca detalhe de um chamado específico |
| `listarChamados` | Lista chamados do cliente no portal |
| `responderChamado` | Responde chamado com texto e/ou documento |
| `publicarComunicado` | Publica comunicado no portal (todos os clientes ou segmento) |
| `enviarMensagemPortal` | Envia mensagem privada no portal para cliente específico |
| `listarComunicados` | Lista comunicados publicados não expirados |

#### Documentos (4)
| Tool | Descrição |
|---|---|
| `listarDocumentosPendentes` | Documentos aguardando aprovação |
| `aprovarDocumento` | Aprova ou rejeita documento (com `motivoRejeicao` obrigatório na rejeição) |
| `resumirDocumento` | Gera resumo de documento do cliente via IA |
| `anexarDocumentoChat` | Anexa documento ao contexto da conversa em andamento |

#### Email (1)
| Tool | Descrição |
|---|---|
| `classificarEmail` | Classifica email recebido por categoria/urgência |

#### Comunicação segmentada (1)
| Tool | Descrição |
|---|---|
| `enviarComunicadoSegmentado` | Envia comunicado por segmento de clientes (plano, regime, etc.) |

#### NFS-e via Spedy (8)
| Tool | Descrição |
|---|---|
| `verificarConfiguracaoNfse` | Verifica se a empresa está configurada para emitir NFS-e |
| `emitirNotaFiscal` | Emite NFS-e via Spedy para o cliente |
| `reemitirNotaFiscal` | Reemite NFS-e rejeitada ou com erro, permitindo corrigir dados |
| `consultarNotasFiscais` | Lista NFS-e emitidas com filtros de período e status |
| `cancelarNotaFiscal` | Cancela NFS-e autorizada (validações: prazo ≤30d, justificativa ≥15 chars) |
| `enviarNotaFiscalCliente` | Reenvia NFS-e ao cliente por email/WhatsApp |
| `reenviarEmailNotaFiscal` | Reenvio específico por email |
| `buscarTomadoresRecorrentes` | Lista tomadores frequentes para facilitar nova emissão |

#### Externas (1)
| Tool | Descrição |
|---|---|
| `buscarCnpjExterno` | Consulta pública Receita Federal via proxy (situação cadastral, CNAE, endereço, sócios) |

### Feedback loop

Toda execução de tool bem-sucedida com `clienteId` ou `leadId` é indexada no RAG via `indexarAsync('agenteAcao', ...)`. Isso permite que futuras perguntas sobre "o que foi feito" retornem ações anteriores do agente como contexto.

### Auditoria

Todas as execuções são salvas na tabela `AgenteAcao`:
```
AgenteAcao { id, tool, input, resultado, sucesso, duracaoMs,
             clienteId?, leadId?, usuarioNome, solicitanteAI, criadoEm }
```

UI: **CRM → Configurações → IA → Logs** — histórico de ações com filtros por tool/status/período.

---

## Guardrails de Segurança

Arquivo: [`src/lib/ai/ask.ts`](../src/lib/ai/ask.ts) — constante `SYSTEM_SECURITY_GUARDRAILS`

Aplicados em **todas** as IAs, em todos os canais:

| Regra | Contexto |
|---|---|
| Nunca inventar prazos ou valores fiscais não presentes no RAG | Todos |
| Nunca revelar dados de outros clientes ou leads | Todos |
| Nunca executar ações irreversíveis sem confirmação explícita | CRM |
| Contato não identificado no WhatsApp: não fornecer dados pessoais, valores de contrato ou prazos específicos | WhatsApp |
| Não vazar notas internas, ligações ou conversas WhatsApp da equipe para o portal do cliente | Portal |

### Guardrail WhatsApp — contato desconhecido

Quando `tipo: 'desconhecido'` (sem clienteId e sem leadId), o guardrail ativo instrui:
> "Se o contexto indicar que o contato é DESCONHECIDO (sem clienteId e sem leadId), NÃO forneça informações pessoais, valores de contrato, prazos específicos nem acesso a documentos. Responda apenas com informações públicas do escritório (localização, horário, planos gerais). Se o contato demonstrar interesse, use ##LEAD## para criar um prospect."

---

## WhatsApp — Segurança do Chat Humano

Arquivo central de utilitários: [`src/lib/whatsapp-utils.ts`](../src/lib/whatsapp-utils.ts)

Exporta funções compartilhadas pelos 3 endpoints POST de WhatsApp (`clientes`, `leads`, `socios`):

| Utilitário | O que faz |
|---|---|
| `buildRemoteJid(phone)` | Normaliza número → valida 8–13 dígitos → adiciona `@s.whatsapp.net`. Retorna `null` se inválido. |
| `isMediaUrlTrusted(url)` | Valida hostname contra `STORAGE_PUBLIC_URL` — previne SSRF |
| `checkRateLimit(userId)` | 30 msgs / 60 s por usuário logado — in-memory, Redis-ready |
| `getEvolutionConfig()` | Lê config da Evolution API do banco do escritório |
| `WHATSAPP_ALLOWED_MIME` | Set com MIME types permitidos (images, PDF, Word, Excel, CSV, texto) |

### Validações em todos os POSTs WhatsApp

1. **Auth** — `session.user.id` obrigatório
2. **Rate limit** — `checkRateLimit(userId)` → 429 com `Retry-After` se excedido
3. **Conteúdo** — `conteudo` ou `mediaUrl` obrigatório (não ambos vazios)
4. **MIME** — quando `mediaUrl` presente: `mediaMimeType` obrigatório e na whitelist
5. **Hostname** — `mediaUrl` validada contra `STORAGE_PUBLIC_URL` (previne SSRF)
6. **Telefone** — `buildRemoteJid` rejeita números com < 8 ou > 13 dígitos
7. **Sentry** — try/catch com `captureException` em todo o fluxo (tags: `module`, `operation`)

### SSE — stream de novas mensagens

Endpoint: `GET /api/stream/conversas/[id]`

- Valida que a conversa tem ao menos um `clienteId | leadId | socioId` vinculado (403 para conversas órfãs)
- `sseHealthyRef` no hook client-side: polling de 8 s só dispara quando SSE está inativo
- Reconexão exponencial (máx 5 tentativas, backoff até 30 s)
- `isMounted` flag previne criação de EventSource após desmontagem (race condition)

---

## Lacunas / próximos passos

| Item | Status |
|---|---|
| Caixa de entrada de emails não identificados | Pendente — UI para emails recebidos sem vínculo com cliente/lead |
| Calendário fiscal por tipo de cliente | Pendente — base para lembretes proativos automáticos (MEI/PF/EPP) |
| Open Finance (Pluggy) | Pendente — plano detalhado em `project_openfinance_pluggy.md` |
| Re-contexto WhatsApp pós-24h | Pendente — injetar últimas mensagens da conversa anterior ao criar nova janela |
| Verificação de identidade WhatsApp | Pendente — 4 opções mapeadas, recomendação: PIN de sessão + restrição de escopo |
| Chat do portal (Clara) | Pendente — 4 decisões pendentes antes de implementar (auth, escopo, handoff A/B, notificações) |
| Rate limit WhatsApp (Redis) | Atual implementação in-memory — migrar para Redis em produção multi-instância |
