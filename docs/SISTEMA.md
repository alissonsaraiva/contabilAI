# AVOS — Documentação Completa do Sistema
> **Gerado em**: 2026-04-02 | **Versão**: v3.10.7 | **Fonte da verdade**: código-fonte

---

## 📌 Visão Geral

**AVOS** (rebrandeado de ContabAI em 2026-03-30) é uma plataforma SaaS de gestão para escritórios de contabilidade. O sistema tem três faces:

1. **CRM interno** — usado por contadores e assistentes para gerir clientes, leads, finanças, documentos, notas fiscais e atendimentos
2. **Portal do cliente** — acesso autenticado via magic link ou OTP para clientes verem cobranças, documentos, NFS-e, chamados e conversar com a IA "Clara"
3. **Onboarding público** — widget conversacional que captura prospects, recomenda planos e inicia o fluxo de contratação

### Principais responsabilidades

- Gestão completa de leads → clientes (funil de onboarding com IA)
- Cobrança recorrente integrada com Asaas (PIX, boleto, cartão)
- Emissão de NFS-e via Spedy com entrega multicanal
- IA conversacional em 4 canais: WhatsApp, onboarding, CRM e portal
- 38+ tools operacionais executáveis pela IA do CRM
- RAG (Retrieval-Augmented Generation) com busca híbrida (embeddings + full-text)
- Sistema de emails com inbox IMAP e threading completo
- Assinatura eletrônica de contratos (Zapsign / Clicksign / DocuSeal)
- Portal PWA com web push notifications

---

## 🏗️ Arquitetura

### Stack Técnica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Framework | Next.js (App Router) | 16.2.1 |
| UI | React + Tailwind CSS 4 | 19.2.4 |
| ORM | Prisma | 7.5.0 |
| Banco | PostgreSQL 17 + pgvector 0.8.2 | — |
| Linguagem | TypeScript | 5.x |
| IA | Claude Haiku 4.5 (padrão) + OpenAI/Groq/Gemini | — |
| Storage | Cloudflare R2 (S3-compatible) | — |
| Deploy | Docker + VPS (6 containers) via ghcr.io | — |
| Monitoramento | Sentry (client + server + edge) | — |
| Auth CRM | NextAuth.js (credentials) | — |
| Auth Portal | Magic link + OTP WhatsApp + sessions | — |

### Camadas do Sistema

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                   │
│   CRM (crm.avos.digital)  │  Portal (portal.avos.digital) │
│   Onboarding (widget)     │  Landing (avos.digital)      │
├─────────────────────────────────────────────────────────┤
│                 API ROUTES (Next.js)                    │
│   /api/crm/**  │  /api/portal/**  │  /api/webhooks/**   │
│   /api/whatsapp/webhook  │  /api/cron/**                │
├─────────────────────────────────────────────────────────┤
│                   SERVIÇOS (src/lib/)                   │
│   ai/  │  email/  │  whatsapp/  │  rag/  │  services/   │
├─────────────────────────────────────────────────────────┤
│                   BANCO DE DADOS                        │
│   PostgreSQL 17 (porta 32768 na VPS)                   │
│   pgvector 0.8.2 para embeddings RAG                   │
├─────────────────────────────────────────────────────────┤
│               INTEGRAÇÕES EXTERNAS                      │
│  Asaas │ Spedy │ Evolution API │ Zapsign │ Clicksign     │
│  DocuSeal │ SERPRO │ Cloudflare R2 │ Anthropic API      │
└─────────────────────────────────────────────────────────┘
```

### Roteamento por Subdomínio

**Arquivo**: `src/proxy.ts` (⚠️ NÃO usar `src/middleware.ts` — causa build error)

- `crm.avos.digital` → rewrite para `/(crm)/...`
- `portal.avos.digital` → rewrite para `/(portal)/...`
- `avos.digital` → landing/onboarding público

### Padrões de Projeto

- **Server Components** — páginas carregam dados no servidor por padrão
- **Client Components** — `"use client"` apenas onde há interatividade
- **Route Handlers** — toda lógica de negócio em `/api/**`
- **Try/Catch obrigatório** — todo código deve ter tratamento de erro explícito
- **Sentry em toda operação crítica** — `Sentry.captureException()` em todos os `catch`
- **Migrations via Prisma** — NUNCA `db push`, sempre `migrate dev --name <nome>`

---

## 📁 Estrutura de Pastas

```
contabilAI/
├── prisma/
│   ├── schema.prisma          # Schema unificado (~996 linhas, 30+ modelos)
│   ├── migrations/            # 35+ arquivos SQL (histórico desde v1.0)
│   ├── seed.ts                # Seed de planos iniciais
│   └── init-vectors.sql       # Setup pgvector + índices HNSW
├── scripts/
│   └── migrate-vectors-canal.sql  # Migração de canal no RAG
├── docs/
│   ├── ia-arquitetura.md      # Documentação legacy da IA
│   └── SISTEMA.md             # Este arquivo (atualizado)
├── src/
│   ├── app/
│   │   ├── (crm)/crm/         # Interface do CRM (autenticada)
│   │   ├── (portal)/portal/   # Portal do cliente (magic link / OTP)
│   │   ├── (onboarding)/      # Widget público de onboarding
│   │   └── api/               # Todas as route handlers
│   ├── components/
│   │   ├── crm/               # 70+ componentes do CRM
│   │   ├── portal/            # 12+ componentes do portal
│   │   └── ui/                # Shadcn/ui + customizações
│   ├── hooks/                 # Custom React hooks
│   ├── lib/
│   │   ├── ai/                # IA: providers, tools, agente, RAG, conversa
│   │   │   ├── agent.ts       # Agente operacional (loop de tool calling)
│   │   │   ├── ask.ts         # Chat simples com contexto
│   │   │   ├── config.ts      # Configuração de providers
│   │   │   ├── classificar-intencao.ts  # Classificador de intenção
│   │   │   └── tools/         # 38+ tool definitions
│   │   ├── email/
│   │   │   ├── imap.ts        # Recebimento IMAP (imapflow)
│   │   │   ├── send.ts        # Envio SMTP (nodemailer + Resend)
│   │   │   ├── processar.ts   # Pipeline de processamento
│   │   │   └── com-historico.ts  # Threading de emails
│   │   ├── whatsapp/
│   │   │   ├── constants.ts   # Limites, rate limit, padrões
│   │   │   ├── identificar-contato.ts  # Cliente/lead/sócio/prospect
│   │   │   ├── arquivar-midia.ts       # Salvar mídia no R2
│   │   │   ├── processar-pendentes.ts  # Processar fila de mensagens
│   │   │   └── pipeline/      # Etapas do pipeline de processamento
│   │   ├── rag/
│   │   │   ├── ingest.ts      # Indexação de documentos
│   │   │   └── ingestores/    # 8 ingestores especializados
│   │   ├── services/
│   │   │   ├── asaas-sync.ts  # Sincronização de cobranças Asaas
│   │   │   ├── interacoes.ts  # Registro de interações no feed
│   │   │   ├── notas-fiscais.ts  # Emissão NFS-e Spedy
│   │   │   ├── classificar-documento.ts  # IA classifica docs
│   │   │   └── nfse/          # Módulo completo de NFS-e
│   │   ├── schemas/           # Schemas Zod de validação
│   │   ├── utils/
│   │   │   └── phone.ts       # Normalização de números telefone
│   │   ├── asaas.ts           # Client da API Asaas
│   │   ├── event-bus.ts       # EventEmitter para comunicação interna
│   │   └── rag/ingest.ts      # Orquestrador de ingestão RAG
│   ├── types/                 # TypeScript types globais
│   ├── proxy.ts               # Middleware de subdomínio (USAR ESTE)
│   ├── middleware.ts           # ⚠️ DESCONTINUADO — não tocar
│   └── instrumentation*.ts    # Setup Sentry (client/server/edge)
├── .env.example               # Template de variáveis
├── next.config.ts             # Config Next.js (Sentry, CSP, headers)
├── sentry.*.config.ts         # Sentry por ambiente
├── CLAUDE.md → AGENTS.md      # Regras para agentes de IA
└── package.json               # v0.1.0 (nome interno)
```

---

## 🔄 Fluxos Principais

### 1. Fluxo de Onboarding (Lead → Cliente)

```
1. Prospect acessa widget público
2. Chat com IA (Anthropic Claude Haiku)
   └── IA coleta: nome, email, telefone, CNPJ, tipo empresa
   └── IA recomenda plano baseado no perfil
3. Lead criado via POST /api/onboarding/salvar-progresso (SEM AUTH)
4. Etapas: iniciado → simulador → plano_escolhido → dados_preenchidos → revisao
5. Contrato gerado (PDF renderizado via puppeteer/wkhtmltopdf)
6. Lead recebe link de assinatura (Zapsign ou Clicksign)
7. Webhook de assinatura → status: assinado
8. Lead promovido a Cliente automaticamente
9. Asaas provisionado: createCustomer + createSubscription
10. Magic link enviado para portal do cliente
```

### 2. Fluxo de WhatsApp

```
1. Mensagem recebida na Evolution API
2. POST /api/whatsapp/webhook
3. Validação do payload
4. Rate limit: mínimo 5s entre respostas (RATE_LIMIT_MS)
5. Identificar contato:
   └── buscar por telefone → Cliente? Lead? Sócio? Prospect?
   └── Cache 24h (PHONE_CACHE_TTL_MS)
6. Buscar/criar ConversaIA
7. Lock distribuído via processandoEm (evita duplo processamento)
8. Processar mídia:
   └── Áudio → transcrever (Whisper)
   └── Imagem → enviar base64 para Claude (visão)
   └── PDF → extrair texto + resumir
9. Carregar contexto (sistema, cliente, histórico últimas 20 msgs)
10. ask() → resposta da IA
    └── Se ##HUMANO## → criar Escalação
11. sendHumanLike() → enviar resposta Evolution API
12. Salvar MensagemIA no banco
```

### 3. Fluxo de Emissão de NFS-e

```
1. Operador/IA executa emitirNotaFiscal()
2. Validação: empresa tem Spedy configurado?
3. POST para API Spedy com dados do tomador
4. NotaFiscal criada no banco com status: enviando
5. Spedy processa (SEFAZ/prefeitura)
6. Webhook /api/webhooks/spedy/[token]:
   └── autorizada → atualiza status, salva numero/xml/pdf URLs
   └── rejeitada → registra erro, permite reemissão
7. Se autorizada: entregar ao cliente
   └── WhatsApp: sendMedia (PDF)
   └── Email: attachment SMTP
   └── Portal: disponível na tab de NFS-e
```

### 4. Fluxo de Email (IMAP Sync)

```
1. Cron job /api/email/sync (autenticado com CRON_SECRET)
2. Conectar IMAP (imapflow) → buscar UNSEEN
3. Parser (mailparser): texto, HTML, attachments
4. Threading: messageId + inReplyTo + threadId
5. Buscar cliente por email FROM
6. Criar Interacao (tipo: email_recebido, origem: sistema)
7. Notificar operador responsável
8. Agente pode responder via tool enviarEmail()
```

### 5. Fluxo de Escalação

```
1. IA detecta caso complexo → ##HUMANO## no texto
2. Conversa pausada (pausadaEm = now)
3. Escalacao criada com historico (JSON) + motivoIA
4. Notificação para operadores no CRM
5. Operador vê no grid de Atendimentos (ping em tempo real via SSE)
6. Operador responde via /api/escalacoes/[id]/responder
7. Resposta enviada ao cliente (canal original: WA/portal)
8. IA retoma conversa se necessário
```

### 6. Fluxo de Cobrança (Asaas)

```
1. Cliente provisionado: createCustomer()
2. Subscription criada: createSubscription() (mensal)
3. Asaas gera cobranças automaticamente
4. Webhook /api/webhooks/asaas:
   └── PAYMENT_RECEIVED → status: ativo
   └── PAYMENT_OVERDUE → status: inadimplente
5. Se inadimplente:
   └── Automático: notificar operador
   └── Manual: operador usa ferramenta de cobrança
   └── IA usa enviarCobrancaInadimplente()
6. Segunda via: gerarSegundaViaAsaas() → novo QR code PIX / código barras
```

### 7. Fluxo de RAG (Indexação + Busca)

```
INGESTÃO:
1. Documento criado/atualizado no banco
2. Ingestor apropriado processa (texto, chunking)
3. Embedding gerado (Voyage AI ou Anthropic)
4. Vetores salvos em PostgreSQL + pgvector
5. Índice HNSW para busca aproximada

BUSCA (Híbrida):
1. Query do usuário/IA
2. Embedding da query
3. Similarity search (cosine distance, threshold 0.72)
4. Full-text search (PostgreSQL tsvector)
5. Reranking e merge dos resultados
6. Top-K injetados no contexto da IA
```

---

## 🔌 APIs / Interfaces

### Autenticação

| Rota | Método | Auth | Descrição |
|------|--------|------|-----------|
| `/api/auth/[...nextauth]` | GET/POST | — | NextAuth CRM (credentials) |
| `/api/portal/magic-link` | POST | — | Enviar magic link por email |
| `/api/portal/otp/whatsapp` | POST | — | Enviar OTP via WhatsApp |
| `/api/portal/otp/verificar` | POST | — | Validar OTP |
| `/api/portal/logout` | POST | Portal session | Revogar sessão |

### CRM — Clientes

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/clientes` | GET | Listar (paginado, filtros: status, plano, busca) |
| `/api/clientes` | POST | Criar cliente |
| `/api/clientes/[id]` | GET/PUT | Detalhe / atualizar |
| `/api/clientes/[id]/suspender` | POST | Suspender |
| `/api/clientes/[id]/cancelar` | POST | Cancelar |
| `/api/clientes/[id]/reativar` | POST | Reativar |
| `/api/crm/clientes/[id]/cobrancas` | GET | Cobranças Asaas |
| `/api/crm/clientes/[id]/cobrancas/[id]/segunda-via` | GET | Segunda via |
| `/api/crm/clientes/[id]/forma-pagamento` | PUT | Atualizar forma de pagamento |
| `/api/crm/clientes/[id]/vencimento` | PUT | Atualizar dia vencimento |
| `/api/crm/clientes/[id]/portal-chat` | GET/POST | Clara para o cliente |
| `/api/crm/clientes/[id]/provisionar` | POST | Criar no Asaas |

### CRM — NFS-e

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/crm/notas-fiscais` | GET/POST | Listar / emitir |
| `/api/crm/notas-fiscais/municipios` | GET | Municípios suportados Spedy |
| `/api/crm/notas-fiscais/[id]` | GET/PUT | Detalhe / atualizar rascunho |
| `/api/crm/notas-fiscais/[id]/pdf` | GET | Download PDF |
| `/api/crm/notas-fiscais/[id]/xml` | GET | Download XML |
| `/api/crm/notas-fiscais/[id]/cancelar` | POST | Cancelar na SEFAZ |
| `/api/crm/notas-fiscais/[id]/reemitir` | POST | Reemitir |
| `/api/crm/notas-fiscais/[id]/entregar` | POST | Enviar ao cliente |

### CRM — Email

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/email/inbox` | GET | Listar inbox IMAP (paginado) |
| `/api/email/inbox/[id]/vincular` | POST | Vincular email a cliente/lead |
| `/api/email/inbox/[id]/arquivar-anexo` | POST | Arquivar anexo no R2 |
| `/api/email/enviar` | POST | Enviar email SMTP |
| `/api/email/sync` | POST | Sincronizar IMAP (cron, precisa CRON_SECRET) |

### CRM — IA e Agente

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/crm/ai/chat` | POST | Chat IA com cliente (stream SSE) |
| `/api/agente/crm` | POST | Executar agente operacional |
| `/api/agente/tools` | GET | Listar tools disponíveis |
| `/api/agente/acoes` | GET | Histórico de ações executadas |
| `/api/agente/agendamentos` | GET/POST | Crons do agente |

### Webhooks Recebidos

| Rota | Validação | Descrição |
|------|-----------|-----------|
| `/api/webhooks/asaas` | `asaasWebhookToken` no header | Pagamentos/cobranças |
| `/api/webhooks/spedy/[token]` | token = SHA-256 da API key | Status NFS-e |
| `/api/webhooks/zapsign` | HMAC do payload | Assinatura de contrato |
| `/api/webhooks/clicksign` | Token do escritório | Assinatura de contrato |
| `/api/whatsapp/webhook` | — | Mensagens WhatsApp (Evolution API) |

### Portal do Cliente

| Rota | Auth | Descrição |
|------|------|-----------|
| `/api/portal/financeiro/cobrancas` | Portal session | Listar cobranças |
| `/api/portal/financeiro/segunda-via` | Portal session | Segunda via |
| `/api/portal/documentos` | Portal session | Listar/upload documentos |
| `/api/portal/documentos/[id]/download` | Portal session | Download com URL assinada R2 |
| `/api/portal/notas-fiscais` | Portal session | Listar NFS-e |
| `/api/portal/ordens-servico` | Portal session | Listar/criar chamados |
| `/api/portal/chat` | Portal session | Clara (IA) |
| `/api/portal/push/subscribe` | Portal session | Registrar web push |

### Cron Jobs (precisam `CRON_SECRET` no header)

| Rota | Frequência sugerida | Descrição |
|------|--------------------|-----------|
| `/api/email/sync` | A cada 5 min | Sincronizar IMAP |
| `/api/whatsapp/processar-pendentes` | A cada minuto | Processar fila WA |
| `/api/cron/reconciliar-notas` | Diário | Reconciliar status NFS-e com Spedy |
| `/api/agente/cron` | Conforme `AgendamentoAgente` | Disparar agendamentos do agente |

---

## 🔗 Integrações Externas

### Asaas (Cobrança)
- **Tipo**: REST API externa
- **Auth**: `asaasApiKey` salvo por escritório no banco
- **Webhook**: `asaasWebhookToken` + `/api/webhooks/asaas`
- **Ponto de falha**: Asaas offline → cobranças não atualizadas. Sem retry automático.
- **Arquivo principal**: `src/lib/asaas.ts`, `src/lib/services/asaas-sync.ts`

### Spedy (NFS-e)
- **Tipo**: REST API por empresa (cada empresa tem sua própria `spedyApiKey`)
- **Webhook**: token = SHA-256 da API key → `/api/webhooks/spedy/[token]`
- **Ponto de falha**: Webhook pode chegar fora de ordem; sem mecanismo de retry explícito
- **Arquivo principal**: `src/lib/services/notas-fiscais.ts`, `src/lib/services/nfse/`

### Evolution API (WhatsApp)
- **Tipo**: REST API self-hosted (provavelmente na VPS ou terceiro)
- **Auth**: Bearer token (`EVOLUTION_API_KEY`)
- **Webhook**: `/api/whatsapp/webhook` (sem autenticação de payload)
- **Ponto de falha**: Instância desconectada → mensagens não chegam. Sem health check automático.

### Cloudflare R2 (Storage)
- **Tipo**: S3-compatible
- **Auth**: `STORAGE_ACCESS_KEY_ID` + `STORAGE_SECRET_ACCESS_KEY`
- **URLs**: públicas via `STORAGE_PUBLIC_URL` ou assinadas (5 min expiry)
- **Ponto de falha**: URL pública pode mudar; downloads com URL assinada têm timeout

### Zapsign / Clicksign (Assinatura Eletrônica)
- **Tipo**: REST API (selecionável por escritório)
- **Webhook**: `/api/webhooks/zapsign` e `/api/webhooks/clicksign`
- **Idempotência**: `WebhookLog` previne processamento duplicado

### DocuSeal (Self-hosted)
- **URL**: `http://82.25.79.193:32825`
- **Tipo**: Iframe embed (não REST puro)
- **Ponto de falha**: Single point of failure — está na VPS

### SERPRO (CNPJ/CPF)
- **Auth**: tokens salvos no banco (`Escritorio.serproCpfToken`, `serproCnpjToken`)
- **Ponto de falha**: Rate limit e autenticação vencida causam falha silenciosa no auto-fill

### Anthropic API (IA Principal)
- **Modelos**: Claude Haiku 4.5 (padrão), Claude Sonnet/Opus (configurável)
- **Ponto de falha**: Sem fallback automático para outro provider se API cair

---

## ⚙️ Configuração

### Variáveis de Ambiente

```env
# ─── Banco de Dados ──────────────────────────────────────
DATABASE_URL="postgresql://user:pass@host:5432/contabil_ia"
VECTORS_DATABASE_URL="..."        # mesmo banco se tiver pgvector

# ─── Auth ────────────────────────────────────────────────
AUTH_SECRET="openssl rand -base64 32"
AUTH_URL="https://crm.avos.digital"

# ─── IA ──────────────────────────────────────────────────
ANTHROPIC_API_KEY=""
OPENAI_API_KEY=""          # opcional
OPENAI_BASE_URL=""         # opcional
GOOGLE_API_KEY=""          # opcional
GROQ_API_KEY=""            # opcional
VOYAGE_API_KEY=""          # para embeddings (alternativa ao Anthropic)

# ─── Storage (Cloudflare R2) ─────────────────────────────
STORAGE_ENDPOINT="https://<account>.r2.cloudflarestorage.com"
STORAGE_ACCESS_KEY_ID=""
STORAGE_SECRET_ACCESS_KEY=""
STORAGE_BUCKET_NAME="contabai"
STORAGE_PUBLIC_URL="https://storage.avos.digital"
STORAGE_REGION="auto"

# ─── WhatsApp (Evolution API) ────────────────────────────
EVOLUTION_API_URL=""
EVOLUTION_INSTANCE=""
EVOLUTION_API_KEY=""

# ─── Monitoramento ───────────────────────────────────────
NEXT_PUBLIC_SENTRY_DSN=""
SENTRY_ORG=""
SENTRY_PROJECT=""
SENTRY_AUTH_TOKEN=""

# ─── Web Push (PWA) ──────────────────────────────────────
NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
VAPID_SUBJECT="mailto:contato@avos.digital"

# ─── Cron Jobs ───────────────────────────────────────────
CRON_SECRET="openssl rand -base64 32"

# ─── URLs Públicas ───────────────────────────────────────
NEXT_PUBLIC_APP_URL="https://avos.digital"
NEXT_PUBLIC_CRM_URL="https://crm.avos.digital"
NEXT_PUBLIC_PORTAL_URL="https://portal.avos.digital"
```

> **Nota**: `EMAIL_*`, `ASAAS_*`, `SPEDY_*`, `CLICKSIGN_*`, `SERPRO_*` são configurados **por escritório** e salvos criptografados no banco (`Escritorio`), não em variáveis de ambiente globais.

### Setup Local

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env.local

# 3. Gerar cliente Prisma
npx prisma generate

# 4. Aplicar migrations no banco local
npx prisma migrate dev

# 5. Seed de dados iniciais (planos)
npx prisma db seed

# 6. Inicializar pgvector
psql $DATABASE_URL -f prisma/init-vectors.sql

# 7. Rodar em desenvolvimento
npm run dev
```

### Pre-deploy checklist (OBRIGATÓRIO)

```bash
# 1. TypeScript sem erros
npx tsc --noEmit

# 2. Build de produção sem erros
npm run build

# 3. Criar tag de versão
git tag v3.x.y
git push origin v3.x.y  # CI só dispara com tag v*
```

---

## 🧠 Sistema de IA

### 4 Canais de IA

| Canal | Arquivo | Contexto | Tools | Escalação |
|-------|---------|---------|-------|-----------|
| **Onboarding** | `ask.ts` | Lead + planos | Limitadas (criar lead) | Não |
| **CRM** | `ask.ts` + `agent.ts` | Cliente + global | 38+ tools | Sim |
| **Portal (Clara)** | `ask.ts` | Cliente + comunicados | Limitadas (OS, docs) | `##HUMANO##` → Escalação |
| **WhatsApp** | `ask.ts` | Cliente/lead + histórico 20 msgs | Moderadas | `##HUMANO##` → Escalação |

### Agente Operacional — 38 Tools

**Leitura de Dados (15)**:
`buscarDadosCliente`, `buscarDadosOperador`, `consultarDados`, `buscarHistorico`, `buscarDocumentos`, `buscarOrdenServico`, `buscarEmailInbox`, `buscarTomadoresRecorrentes`, `buscarCobrancaAberta`, `listarLeadsInativos`, `listarComunicados`, `listarPlanos`, `listarAgendamentos`, `listarDocumentosPendentes`, `listarEmailsPendentes`

**Escrita/Mutação (20)**:
`criarLead`, `criarCliente`, `atualizarDadosCliente`, `atualizarStatusLead`, `avancarLead`, `criarOrdenServico`, `responderOrdenServico`, `registrarInteracao`, `enviarEmail`, `enviarWhatsappCliente`, `enviarWhatsappLead`, `enviarWhatsappSocio`, `enviarDocumentoWhatsapp`, `enviarMensagemPortal`, `enviarComunicadoSegmentado`, `enviarCobrancaInadimplente`, `enviarLembreteVencimento`, `enviarNotaFiscalCliente`, `reativarCliente`, `transferirCliente`

**NFS-e (5)**:
`emitirNotaFiscal`, `consultarNotasFiscais`, `reemitirNotaFiscal`, `cancelarNotaFiscal`, `verificarConfiguracaoNfse`

**Cobrança (3)**:
`gerarSegundaViaAsaas`, `buscarCobrancaAberta`, `gerarRelatorioInadimplencia`

**Agendamentos (3)**:
`criarAgendamento`, `listarAgendamentos`, `cancelarAgendamento`

**Escalação (2)**:
`responderEscalacao`, `convidarSocioPortal`

**IA/Análise (3)**:
`resumirDocumento`, `classificarEmail`, `resumoFunil`

**Misc (3)**:
`publicarRelatorio`, `resumoDashboard`, `buscarCnpjExterno`

### RAG — Ingestores

| Ingestor | Fontes |
|---------|--------|
| `cliente` | Perfil completo (plano, contatos, endereço) |
| `lead` | Dados onboarding, histórico, status |
| `documento` | Conteúdo de PDFs, NFS-e, guias tributários |
| `escalacao` | Histórico + motivo da escalação |
| `interacao` | Emails, mensagens, anotações |
| `comunicado` | Publicações e alertas |
| `escritorio` | Dados do escritório (endereço, termos, contatos) |
| `agente` | Log de ações executadas (AgenteAcao) |

### Configurações da IA (por escritório)

Salvas no modelo `Escritorio`:
- `iaProvider`: `anthropic | openai | google | groq`
- `iaModel`: string do modelo
- `iaPromptCrm`: prompt customizado para o CRM
- `iaPromptPortal`: prompt customizado para o portal
- `iaPromptWhatsapp`: prompt customizado para WhatsApp
- `iaPromptOnboarding`: prompt customizado para onboarding
- `iaTemperatura`: 0.0 a 1.0
- `iaMaxTokens`: limite de tokens por resposta

---

## 📊 Schema do Banco — Modelos Principais

### Hierarquia de Entidades

```
Escritorio (1)
    ↓
    ├── Usuario (N) — funcionários CRM
    ├── Plano (N) — catálogo de planos
    ├── Lead (N) — prospects em onboarding
    │       └── Contrato (1)
    ├── Cliente (N) — clientes ativos
    │       ├── Empresa (1) — PJ obrigatória
    │       │       └── Socio (N) — sócios com acesso portal
    │       ├── Documento (N)
    │       ├── OrdemServico (N)
    │       ├── CobrancaAsaas (N)
    │       ├── NotaFiscal (N)
    │       ├── Interacao (N)
    │       └── ConversaIA (N)
    │               └── MensagemIA (N)
    └── Comunicado (N)
            └── ComunicadoEnvio (N) — por cliente
```

### Enums Críticos

```
StatusLead: iniciado | simulador | plano_escolhido | dados_preenchidos | revisao |
            contrato_gerado | aguardando_assinatura | assinado | expirado | cancelado

StatusCliente: ativo | inadimplente | suspenso | cancelado

StatusNotaFiscal: rascunho | enviando | processando | autorizada | rejeitada |
                  cancelada | erro_interno

StatusOS: aberta | em_andamento | aguardando_cliente | resolvida | cancelada

StatusEscalacao: pendente | em_atendimento | resolvida

CanalEscalacao: whatsapp | onboarding | portal
```

---

## 🧪 Testes

### O que está coberto
- ❌ Nenhum teste automatizado identificado no codebase (sem `*.test.ts`, `*.spec.ts`, `jest.config`, `vitest.config`)

### O que NÃO está coberto (lacunas críticas)
- Webhooks externos (Asaas, Spedy, Zapsign, Clicksign)
- Pipeline de WhatsApp (recebimento → processamento → resposta)
- Sistema de email (IMAP sync, threading, envio)
- Agente operacional (tool calling, idempotência)
- Fluxo de onboarding (etapas, validações)
- Sistema de pagamento (provisioning Asaas)
- Emissão de NFS-e (Spedy)

> **Risco alto**: O sistema está em produção sem cobertura de testes automatizados.

---

## ⚠️ Limitações Conhecidas

### Identificadas no código

1. **`src/middleware.ts` descontinuado** — coexiste com `src/proxy.ts`, causa build error se ativado
2. **Sem retry automático** para Spedy webhooks — se o servidor cair durante emissão, NFS-e fica em `enviando` para sempre
3. **Lock de WhatsApp** (`processandoEm`) não tem timeout — se a instância cair mid-processing, conversa fica bloqueada indefinidamente
4. **Sem health check** para Evolution API — instância desconectada não é detectada proativamente
5. **DocuSeal self-hosted** (`82.25.79.193:32825`) — single point of failure na VPS
6. **URLs de mídia Evolution API** — dependem de campo `media` que pode variar por versão da API (comentário no código v3.10.7)
7. **Sem paginação** em alguns endpoints de listagem — risco de timeout com volumes grandes
8. **Embeddings sem fallback** — se Voyage AI cair e não há Anthropic como fallback configurado, RAG para
9. **Sem rate limiting** no endpoint `/api/agente/crm` — agente pode ser chamado em loop
10. **`atudalizarDadosCliente`** — nome com typo no código (deveria ser `atualizar`)

---

## 🚨 Pontos de Atenção

### Fluxos Frágeis

| Fluxo | Risco | Motivo |
|-------|-------|--------|
| WhatsApp webhook | Alto | Sem validação de autenticidade do payload |
| Processamento de NFS-e | Alto | Webhook assíncrono sem retry, lock sem timeout |
| Sincronização de email | Médio | Cron manual na VPS, sem monitoramento |
| Conversão Lead→Cliente | Alto | 3 pontos de conversão distintos (leads/assinado, contrato/webhook, manual) — podem criar duplicatas |
| Magic links do portal | Médio | Token hash SHA-256, mas sem rate limit no `/api/portal/magic-link` |

### Áreas com Pouco Log/Rastreamento

- Pipeline de WhatsApp: processamento de mídia falha silenciosamente em alguns casos
- Ingestão RAG: falhas de embedding podem não ser propagadas
- Envio de comunicados: `ComunicadoEnvio` rastreia, mas sem retry

### Código Complexo

- `src/lib/ai/agent.ts` — loop de tool calling com permissões por canal
- `src/lib/whatsapp/pipeline/` — múltiplas etapas assíncronas
- `src/lib/email/com-historico.ts` — threading de emails é não trivial
- `src/proxy.ts` — roteamento por subdomínio em Next.js 16 é frágil por design

---

## 🔍 Inconsistências Encontradas

1. **Nome do projeto**: `package.json` ainda tem versão `0.1.0` e nome interno inconsistente com AVOS
2. **`src/middleware.ts`**: arquivo existe mas está descontinuado — deveria ser removido para evitar confusão
3. **Tool `atudalizarDadosCliente`**: typo persistente no nome da tool (deveria ser `atualizarDadosCliente`)
4. **Documentação `docs/ia-arquitetura.md`**: provavelmente desatualizada em relação às 38 tools e 4 canais atuais
5. **Variáveis `ZAPI_*` no .env.example**: código atual usa `EVOLUTION_*` (Z-API era a integração anterior)
6. **`VAPIR_PRIVATE_KEY`** no .env.example: typo (deveria ser `VAPID_PRIVATE_KEY`)
7. **Endpoint `/api/escalacoes/pendentes-count`**: marcado como legacy no explore mas ainda existe
8. **Schema `Escalacao`**: campo `canal` usa `CanalEscalacao` mas `conversaIAId` é opcional — não força consistência

---

## 🧩 Lacunas (Features Implementadas Sem Documentação)

1. **`src/lib/whatsapp/pipeline/`** — novo pipeline modular, não documentado
2. **`src/lib/schemas/`** — schemas Zod centralizados, sem docs
3. **`src/lib/services/nfse/`** — módulo completo de NFS-e extraído, sem docs
4. **`src/components/crm/notas-fiscais/`** — componentes novos de NFS-e
5. **`src/lib/whatsapp/arquivar-midia.ts`** — arquivamento de mídia recebida no R2
6. **`src/lib/whatsapp/identificar-contato.ts`** — identificação de contato com cache
7. **`src/lib/whatsapp/constants.ts`** — constantes centralizadas
8. **`src/components/ui/back-button.tsx`** — novo componente de navegação
9. **`src/app/api/email/inbox/[id]/arquivar-anexo/`** — endpoint para arquivar anexos de email
10. **Migration `20260402213941_add_email_thread_fields`** — novos campos de threading no email

---

## 💡 Sugestões de Melhoria

### Segurança
1. **Adicionar HMAC/auth no webhook WhatsApp** — qualquer um pode POSTar para `/api/whatsapp/webhook`
2. **Rate limit no magic link** — `api/portal/magic-link` sem proteção contra enumeração
3. **Rate limit no agente** — `/api/agente/crm` pode ser abusado

### Confiabilidade
1. **Timeout no lock de WhatsApp** — `processandoEm` deveria expirar após X minutos
2. **Retry para webhooks Spedy** — NFS-e pode ficar em `enviando` para sempre
3. **Health check Evolution API** — detectar instância desconectada proativamente

### Observabilidade
1. **Adicionar testes automatizados** — ao menos para os webhooks críticos
2. **Monitorar cron jobs** — CRON_SECRET é seguro mas sem alertas de falha
3. **Métricas de RAG** — taxa de hit, latência de busca

### Code Quality
1. **Corrigir typo `atudalizarDadosCliente`** em todas as referências
2. **Remover `src/middleware.ts`** — causa confusão e pode causar bugs
3. **Atualizar `docs/ia-arquitetura.md`** — está desatualizado

---

## 🔄 Memória do Projeto (Resumo para Próximo Desenvolvedor)

### Regras Imutáveis

| Regra | Motivo |
|-------|--------|
| NUNCA `prisma db push` | Bypassa migrations → erros P2022 em produção |
| NUNCA tocar `src/middleware.ts` | Coexistência com proxy.ts causa build error |
| SEMPRE `try/catch` explícito | Zero erros silenciosos — regra de produção |
| SEMPRE `Sentry.captureException()` nos catch | Rastreabilidade em produção |
| Build local antes de commit | Deploy CI falha por erros TS |
| Deploy exige tag `v*` | `git push origin main` sozinho não dispara CI |
| Cron VPS = config manual | Deploy não configura crontab automaticamente |

### Convenções de Código

- Componentes client: `"use client"` no topo
- APIs protegidas: `getServerSession()` antes de qualquer operação
- Webhooks: verificar `WebhookLog` para idempotência
- Interações: sempre registrar via `registrarInteracao()` para feed de atividades
- Notificações: `criarNotificacao()` para alertas no sino do CRM

### Infra VPS

- Host: `82.25.79.193`
- Usuário deploy: `deploy`
- PostgreSQL: porta `32768`
- DocuSeal: porta `32825`
- CI/CD: ghcr.io → 6 containers Docker
- Backup: automático (verificar configuração)
