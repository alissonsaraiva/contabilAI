# AVOS — Plataforma SaaS de Contabilidade com IA

> Versão atual: **v3.9.5+** | Stack: Next.js 16 · React 19 · TypeScript 5 · Prisma 7 · PostgreSQL · Tailwind CSS 4

Plataforma SaaS completa para escritórios contábeis. Inclui CRM com IA integrada, portal do cliente, onboarding automatizado, WhatsApp com IA, RAG sobre base de conhecimento e agente operacional com 60+ tools.

---

## Sumário

- [Visão Geral](#visão-geral)
- [Como Rodar Localmente](#como-rodar-localmente)
- [Estrutura de Pastas](#estrutura-de-pastas)
- [Principais Fluxos](#principais-fluxos)
- [APIs](#apis)
- [Integrações Externas](#integrações-externas)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Boas Práticas](#boas-práticas)
- [Deploy](#deploy)
- [Limitações Conhecidas](#limitações-conhecidas)

---

## Visão Geral

### Três contextos de acesso (subdomínios isolados)

| Subdomínio | Usuário | Rota base |
|---|---|---|
| `crm.avos.digital` | Contadores e admins | `/crm/*` |
| `portal.avos.digital` | Clientes e sócios | `/portal/*` |
| `avos.digital` | Leads / público | `/onboarding/*` |

O isolamento é feito em `src/proxy.ts` (arquivo único — **nunca usar** `src/middleware.ts`).

### As 4 IAs do sistema

| IA | Canal | Endpoint | Função |
|---|---|---|---|
| **Onboarding** | `onboarding` | `POST /api/onboarding/chat` | Conversa com prospects durante o cadastro |
| **CRM (Assistente)** | `crm` | `POST /api/crm/ai/chat` | Assistente interno para contadores |
| **Portal (Clara)** | `portal` | `POST /api/portal/chat` | Atendimento ao cliente no portal |
| **WhatsApp** | `whatsapp` | via webhook Evolution API | Resposta automática via WhatsApp |

Todas usam o mesmo núcleo `askAI()` com RAG híbrido (dense + BM25 → RRF) e provedor configurável por feature.

### Agente Operacional

O Agente CRM (`src/lib/ai/agent.ts`) executa tarefas via tools em loop ReAct (máximo 5 iterações, timeout 45s). Acesso por canal controlado pelo campo `canais` de cada tool + `toolsDesabilitadas` / `toolsCanaisOverride` no banco.

---

## Como Rodar Localmente

### Pré-requisitos

- Node.js 20+
- PostgreSQL com extensão `pgvector` instalada
- Cloudflare R2 ou S3 compatível para storage

### 1. Instalar dependências

```bash
npm install --legacy-peer-deps
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
# edite .env com suas credenciais
```

### 3. Inicializar o banco

```bash
# Aplicar migrations (nunca use db push)
npx prisma migrate dev

# Seed inicial (planos padrão, escritório demo)
npx prisma db seed

# Ativar extensão pgvector (rodar uma vez no banco de vetores)
psql $VECTORS_DATABASE_URL -f scripts/init-vectors.sql
```

### 4. Rodar em desenvolvimento

```bash
npm run dev          # Turbopack (recomendado)
npm run dev:webpack  # Webpack (fallback se Turbopack travar)
```

Acesso: [http://localhost:3000](http://localhost:3000)

> **Antes de commitar:** sempre rodar `npx tsc --noEmit` e `npm run build` localmente.

---

## Estrutura de Pastas

```
contabilAI/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/login/             # Login do CRM
│   │   ├── (crm)/crm/                # Interface do CRM (autenticada)
│   │   │   ├── atendimentos/         # Conversas IA + WhatsApp humano
│   │   │   ├── clientes/             # CRUD de clientes
│   │   │   ├── leads/                # Funil de prospecção
│   │   │   ├── empresas/             # Empresas vinculadas a clientes PJ
│   │   │   ├── dashboard/            # Métricas e visão geral
│   │   │   ├── ordens-servico/       # OS abertas por clientes/contador
│   │   │   ├── emails/               # Inbox IMAP + composição
│   │   │   ├── comunicados/          # Marketing por e-mail
│   │   │   ├── financeiro/           # Inadimplentes (Asaas)
│   │   │   ├── relatorios/           # Relatórios gerados pelo agente
│   │   │   ├── prospeccao/           # Insights de leads
│   │   │   └── configuracoes/        # Admin: IA, e-mail, WhatsApp, planos…
│   │   ├── (portal)/portal/          # Portal do cliente
│   │   │   ├── login/                # Magic link + OTP WhatsApp
│   │   │   ├── dashboard/            # Resumo do cliente
│   │   │   ├── documentos/           # Upload/download de documentos
│   │   │   ├── financeiro/           # Cobranças Asaas
│   │   │   ├── empresa/              # Dados da empresa
│   │   │   └── suporte/os/           # Ordens de serviço
│   │   └── (public)/onboarding/      # Funil público de contratação
│   │       ├── simulador/            # Simulação de honorários
│   │       ├── plano/                # Escolha de plano
│   │       ├── dados/                # Dados pessoais + CNPJ auto-fill
│   │       ├── socios/               # Cadastro de sócios
│   │       ├── revisao/              # Revisão antes de assinar
│   │       ├── contrato/             # Assinatura eletrônica
│   │       └── confirmacao/          # Tela final pós-assinatura
│   │
│   ├── app/api/                      # Route Handlers (API REST)
│   │   ├── agente/                   # Agente operacional (acoes, cron, tools)
│   │   ├── auth/                     # NextAuth CRM
│   │   ├── clientes/                 # CRUD clientes + status + WhatsApp
│   │   ├── cnpj/                     # Consulta CNPJ público (proxy)
│   │   ├── configuracoes/            # Config IA e e-mail
│   │   ├── conhecimento/             # Base RAG (upload, PDF, listagem)
│   │   ├── crm/                      # APIs CRM (clientes, OS, documentos…)
│   │   ├── email/                    # SMTP envio + IMAP sync + inbound
│   │   ├── escalacoes/               # Escalações humanas
│   │   ├── leads/                    # CRUD leads + contrato + WhatsApp
│   │   ├── notificacoes/             # Notificações in-app
│   │   ├── onboarding/               # Chat IA + config + salvar progresso
│   │   ├── portal/                   # API do portal (auth, chat, docs, financeiro)
│   │   ├── rag/                      # Buscar/processar/avaliar RAG
│   │   ├── relatorios/               # CRUD relatórios do agente
│   │   ├── stream/                   # SSE: conversas, escalações, portal
│   │   ├── upload/                   # Upload de arquivos para S3/R2
│   │   ├── webhooks/                 # Asaas, Clicksign, ZapSign, DocuSeal, n8n
│   │   └── whatsapp/                 # Webhook Evolution + media proxy
│   │
│   ├── components/
│   │   ├── crm/                      # Componentes do CRM (drawers, grids, tabs)
│   │   ├── layout/                   # Header + Sidebar do CRM
│   │   ├── onboarding/               # Chat widget público
│   │   ├── portal/                   # Componentes do portal do cliente
│   │   └── ui/                       # Shadcn/UI (button, card, dialog…)
│   │
│   ├── lib/
│   │   ├── ai/                       # Núcleo de IA
│   │   │   ├── agent.ts              # Agente operacional (loop ReAct)
│   │   │   ├── ask.ts                # askAI() — ponto de entrada unificado
│   │   │   ├── config.ts             # getAiConfig() — lê config do banco
│   │   │   ├── conversa.ts           # Gerenciamento de histórico de mensagens
│   │   │   ├── classificar-intencao.ts # Decide: pergunta (RAG) vs ação (agente)
│   │   │   ├── transcribe.ts         # Transcrição de áudio (WhatsApp)
│   │   │   ├── providers/            # Adapters: Claude, OpenAI, Gemini, fallback
│   │   │   └── tools/                # 60+ tools do agente (uma por arquivo)
│   │   ├── rag/                      # Pipeline RAG
│   │   │   ├── embeddings.ts         # embedText() via OpenAI/Voyage
│   │   │   ├── store.ts              # searchHybrid() — dense+BM25+RRF
│   │   │   ├── ingest.ts             # Ingestão de chunks no banco de vetores
│   │   │   └── chunker.ts            # chunkText() com sobreposição
│   │   ├── services/                 # Serviços de domínio
│   │   │   ├── documentos.ts         # Upload, classificação, S3
│   │   │   ├── escalacoes.ts         # Criação e resolução de escalações
│   │   │   ├── ordens-servico.ts     # CRUD de ordens de serviço
│   │   │   └── resumir-documento.ts  # Resumo de PDF/OFX/XML via IA
│   │   ├── whatsapp/                 # Integração WhatsApp (Evolution API)
│   │   │   ├── action-router.ts      # Roteador de mensagens recebidas
│   │   │   ├── human-like.ts         # Delay humanizado + typing indicator
│   │   │   └── processar-pendentes.ts # Processa mensagens com debounce
│   │   ├── email/                    # SMTP/IMAP
│   │   │   ├── send.ts               # Envio via nodemailer
│   │   │   ├── imap.ts               # Leitura de caixa de entrada (imapflow)
│   │   │   └── template.ts           # Template base de e-mail HTML
│   │   ├── asaas.ts                  # Cliente Asaas (cobranças)
│   │   ├── auth.ts                   # NextAuth config CRM
│   │   ├── auth-portal.ts            # NextAuth config Portal
│   │   ├── crypto.ts                 # AES-256-GCM para chaves sensíveis no banco
│   │   ├── escritorio.ts             # getEscritorioConfig() — config central
│   │   ├── evolution.ts              # Cliente Evolution API
│   │   ├── notificacoes.ts           # Criação de notificações in-app
│   │   ├── portal-session.ts         # Gestão de sessão do portal
│   │   ├── prisma.ts                 # Singleton do Prisma Client
│   │   ├── push.ts                   # Web Push (PWA)
│   │   ├── rate-limit.ts             # Rate limiting por IP/token
│   │   └── storage.ts                # AWS S3 / Cloudflare R2
│   │
│   ├── hooks/                        # React hooks reutilizáveis
│   ├── types/                        # Tipos TypeScript globais
│   └── proxy.ts                      # Middleware de roteamento (Edge runtime)
│
├── prisma/
│   ├── schema.prisma                 # Schema completo do banco
│   ├── migrations/                   # Migrations SQL geradas automaticamente
│   └── seed.ts                       # Seed inicial
│
├── scripts/
│   └── init-vectors.sql              # Cria tabela pgvector
│
├── docs/
│   └── ia-arquitetura.md             # Documentação técnica da IA
│
├── public/                           # Assets estáticos + manifest PWA
├── Dockerfile                        # Build multi-stage (deps/build/migrator/runner)
├── docker-compose.yml                # Orquestração na VPS (Traefik)
├── next.config.ts                    # Config Next.js + Sentry + CSP headers
└── .env.example                      # Template de variáveis de ambiente
```

---

## Principais Fluxos

### 1. Onboarding de lead (público)

```
/onboarding → simulador → plano → dados (CNPJ auto-fill) → sócios → revisão
           → contrato (PDF gerado, enviado via Clicksign/ZapSign/DocuSeal)
           → webhook de assinatura → conversão Lead → Cliente automática
```

- Lead criado no primeiro step e atualizado a cada etapa via `POST /api/onboarding/salvar-progresso`
- Chat flutuante (`/api/onboarding/chat`) disponível em todas as etapas
- CNPJ consultado via proxy público (`/api/cnpj/[cnpj]`) com auto-fill da empresa

### 2. Fluxo de atendimento (CRM + WhatsApp)

```
Mensagem WhatsApp → /api/whatsapp/webhook → debounce 3s → action-router
  → [IA ativa] → askAI() com RAG → resposta humanizada (typing indicator)
  → [IA pausada] → fila de atendimento humano no CRM
  → [escalação] → Escalacao criada → SSE notifica CRM → operador responde
```

- IA pode ser pausada pelo operador → conversa vira atendimento humano
- Áudio transcrito antes de enviar ao LLM
- Operador envia mensagens pelo drawer WhatsApp dentro do CRM

### 3. Portal do cliente

```
Magic link (e-mail) → /portal/login
  → OTP por WhatsApp (opcional) → sessão portal.session-token
  → dashboard → documentos → financeiro (Asaas) → OS → Clara (IA)
```

- Auth totalmente separada do CRM (`auth-portal.ts`)
- Sócios com permissão explícita também acessam o portal
- PWA com Web Push para notificações

### 4. Pipeline RAG (busca semântica)

```
Documento → chunker (512 tokens, 64 sobreposição) → embedText() → pgvector

Query → embedText() → searchHybrid()
  → dense (cosine, threshold 0.55–0.72 por tipo)
  → BM25 (full-text PostgreSQL)
  → RRF (k=60) → top-8 chunks → contexto para o LLM
```

### 5. Agente Operacional (loop ReAct)

```
Instrução → executarAgente() → LLM escolhe tools → executa → resultado
  → [loop até resolução, max 5 iterações, timeout 45s]
  → resposta final → AgenteAcao salva no banco → indexarAsync() atualiza RAG
```

---

## APIs

### CRM (autenticado — NextAuth)

| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/api/clientes` | Listar/criar clientes |
| GET/PUT/DELETE | `/api/clientes/[id]` | Detalhes/editar/deletar |
| POST | `/api/clientes/[id]/suspender\|cancelar\|reativar` | Ciclo de vida |
| GET/POST | `/api/leads` | Listar/criar leads |
| POST | `/api/leads/[id]/avancar` | Avançar etapa do funil |
| POST | `/api/leads/[id]/contrato/enviar` | Gerar e enviar contrato |
| GET/POST | `/api/crm/ordens-servico` | Listar/criar OS |
| GET/POST | `/api/crm/documentos` | Listar/criar documentos |
| POST | `/api/crm/ai/chat` | Chat com IA do CRM |
| POST | `/api/agente/crm` | Executar agente operacional |
| GET | `/api/agente/acoes` | Listar ações executadas |
| GET | `/api/dashboard` | Métricas do dashboard |
| POST | `/api/escalacoes/[id]/responder` | Responder escalação |
| GET | `/api/stream/conversas/[id]` | SSE — stream de conversa |
| POST | `/api/upload` | Upload para S3/R2 |
| GET/POST | `/api/conhecimento` | Base RAG |
| GET/POST | `/api/relatorios` | Relatórios do agente |
| GET/POST | `/api/configuracoes/ia` | Config de IA |
| GET/POST | `/api/usuarios` | Usuários CRM |

### Portal (autenticado — portal session)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/portal/magic-link` | Solicitar magic link |
| POST | `/api/portal/otp/verificar` | Verificar OTP WhatsApp |
| POST | `/api/portal/chat` | Chat com Clara |
| GET | `/api/portal/documentos` | Listar documentos |
| GET | `/api/portal/financeiro/cobrancas` | Listar cobranças |
| GET/POST | `/api/portal/ordens-servico` | OS do portal |
| GET | `/api/stream/portal/conversa` | SSE — conversa Clara |

### Público

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/onboarding/chat` | Chat IA onboarding |
| POST | `/api/onboarding/salvar-progresso` | Salvar etapa do funil |
| GET | `/api/cnpj/[cnpj]` | Consulta CNPJ público |
| GET | `/api/validacoes/cep/[cep]` | Lookup CEP |

### Webhooks

| Rota | Provedor |
|---|---|
| `/api/whatsapp/webhook` | Evolution API |
| `/api/webhooks/asaas` | Asaas |
| `/api/webhooks/clicksign` | Clicksign |
| `/api/webhooks/zapsign` | ZapSign |
| `/api/webhooks/docuseal` | DocuSeal |
| `/api/webhooks/n8n` | n8n |

---

## Integrações Externas

| Serviço | Função | Config |
|---|---|---|
| **Anthropic Claude** | LLM principal (Haiku 4.5 padrão) | `ANTHROPIC_API_KEY` ou banco |
| **OpenAI** | LLM alternativo + embeddings (text-embedding-3-small) | `openaiApiKey` no banco |
| **Google Gemini** | LLM alternativo | `googleApiKey` no banco |
| **Voyage AI** | Embeddings (fallback OpenAI) | `voyageApiKey` no banco |
| **Evolution API** | WhatsApp Business self-hosted | `evolutionApiUrl/Key/Instance` no banco |
| **Asaas** | Cobranças, PIX, boleto, inadimplência | `asaasApiKey` no banco |
| **Clicksign** | Assinatura eletrônica | `CLICKSIGN_API_KEY` no .env |
| **ZapSign** | Assinatura alternativa | `ZAPSIGN_API_TOKEN` no .env |
| **DocuSeal** | Assinatura self-hosted | URL configurada no banco |
| **Cloudflare R2 / S3** | Storage de arquivos | `STORAGE_*` no .env |
| **Sentry** | Monitoramento de erros | `SENTRY_*` no .env |
| **n8n** | Automações e webhooks | `N8N_*` no .env |
| **SERPRO** | Validação CPF/CNPJ (opcional) | `SERPRO_*` no .env |

---

## Variáveis de Ambiente

```env
# Banco
DATABASE_URL="postgresql://..."
VECTORS_DATABASE_URL="postgresql://..."   # precisa ter pgvector; pode ser o mesmo

# Auth
AUTH_SECRET="..."                          # openssl rand -base64 32
AUTH_URL="https://crm.avos.digital"

# IA
ANTHROPIC_API_KEY="..."

# Storage
STORAGE_ENDPOINT="https://..."
STORAGE_ACCESS_KEY_ID="..."
STORAGE_SECRET_ACCESS_KEY="..."
STORAGE_BUCKET_NAME="contabai"
STORAGE_PUBLIC_URL="https://storage.avos.digital"
STORAGE_REGION="auto"

# Segurança
ENCRYPTION_KEY="..."                       # openssl rand -base64 32
CRON_SECRET="..."                          # protege /api/email/sync

# URLs
NEXT_PUBLIC_APP_URL="https://avos.digital"
NEXT_PUBLIC_CRM_URL="https://crm.avos.digital"
NEXT_PUBLIC_PORTAL_URL="https://portal.avos.digital"

# Web Push (PWA)
NEXT_PUBLIC_VAPID_PUBLIC_KEY="..."
VAPID_PRIVATE_KEY="..."
VAPID_SUBJECT="mailto:..."

# Monitoramento
NEXT_PUBLIC_SENTRY_DSN="..."
SENTRY_AUTH_TOKEN="..."
```

Chaves de API de IA, SMTP/IMAP, Asaas e Evolution são armazenadas **encriptadas no banco** (AES-256-GCM via `src/lib/crypto.ts`) e gerenciadas em CRM → Configurações.

---

## Boas Práticas

### Banco de dados
- **NUNCA** use `prisma db push` — sempre `npx prisma migrate dev --name <nome>`
- Commite o arquivo SQL gerado em `prisma/migrations/`
- No deploy o CI roda `prisma migrate deploy` automaticamente

### Deploy
- Deploy exige tag `v*`: `git tag v3.x.y && git push origin v3.x.y`
- Push para `main` sozinho não dispara o CI
- Sempre rodar `npx tsc --noEmit` e `npm run build` antes de commitar

### Middleware
- Usar **apenas** `src/proxy.ts` — nunca `src/middleware.ts`
- Coexistência dos dois causa build error nesta versão do Next.js

### IA e Agente
- Antes de implementar tool: avaliar se não deveria ser feature fixa no CRM
- Toda nova feature deve avaliar indexação no RAG e quais IAs acessam
- Dados dinâmicos do lead/cliente ficam no `systemExtra` do código; regras de negócio ficam no system prompt do banco

### Onboarding
- Etapas públicas usam `POST /api/onboarding/salvar-progresso` — **nunca** `PUT /api/leads/:id` (exige auth)

### Bugs
- Ao corrigir um bug, varrer o codebase buscando o mesmo padrão em outros arquivos

---

## Deploy

### Infraestrutura (VPS Hostinger KVM1)

```
IP:       82.25.79.193
SO:       Ubuntu 24.04.4 LTS
CPU:      1 vCPU (AMD EPYC 9354P)
RAM:      3.8 GB (+ 2 GB swap)
Disco:    48 GB (~12 GB usados)
Domínio:  avos.digital (+ subdomínios crm., portal., www.)
```

### Containers Docker em produção

| Container | Imagem | Porta externa | Função |
|---|---|---|---|
| `contabai_app` | `contabai:latest` | 3000 | Aplicação Next.js |
| `traefik-zq71-traefik-1` | `traefik:latest` | 80 / 443 | Reverse proxy + TLS |
| `postgresql-4cnu-postgresql-1` | `postgres:17` | 32768 | Banco principal |
| `evolution-api-swhw-api-1` | `evoapicloud/evolution-api:latest` | 42572 | WhatsApp Business |
| `evolution-api-swhw-postgres-1` | `postgres:15` | interno | BD do Evolution |
| `evolution-api-swhw-redis-1` | `redis:latest` | interno | Cache do Evolution |

> MinIO está instalado (`/home/deploy/minio/`) mas **não está rodando** — storage usa Cloudflare R2.

### Redes Docker

| Rede | Uso |
|---|---|
| `contabil_net` | App, MinIO (compartilhada) |
| `evolution-api-swhw_default` | Isolada: Evolution + seu Postgres + Redis |
| `postgresql-4cnu_default` | Isolada: PostgreSQL principal |

### Bancos PostgreSQL (instância na porta 32768)

| Banco | Uso |
|---|---|
| `contabil_ia` | App principal (25 tabelas + schema `vectors`) |
| `evolution` | Dados da Evolution API |
| `n8n` | n8n (BD existe mas serviço não está rodando) |

**pgvector:** extensão `vector 0.8.2` instalada. Schema `vectors.embeddings` com índice HNSW (m=16, ef_construction=128).

### Estrutura de pastas na VPS

```
/home/deploy/
├── contabai/                # Código da app + .env + docker-compose.yml
│   ├── .env                 # Variáveis de produção
│   ├── backups/             # pg_dump automático antes de cada deploy (últimos 10)
│   └── .github/workflows/   # CI/CD (GitHub Actions)
├── minio/                   # MinIO storage (instalado, não rodando)
│   └── docker-compose.yml
├── vectors/                 # Dados pgvector (pasta do postgres)
└── deploy.sh                # Script de deploy manual (git pull + build local)
```

### Traefik

- ACME email: `alissonsaraiva@gmail.com`
- Let's Encrypt via HTTP challenge
- HTTP → HTTPS redirect automático
- Hosts ativos: `avos.digital`, `www.avos.digital`, `crm.avos.digital`, `portal.avos.digital`

### Pipeline CI/CD (GitHub Actions)

1. `git tag v3.x.y && git push origin v3.x.y`
2. GitHub Actions builda dois targets: `migrator` e `runner` → push para `ghcr.io`
3. SSH na VPS: backup automático do banco (`pg_dump`)
4. Pull das imagens do ghcr.io → re-tag como `contabai:latest`
5. Migrator container roda `prisma migrate deploy`
6. Inicializa schema `vectors` pgvector (idempotente)
7. `docker compose up -d --no-deps app`
8. Limpeza de imagens antigas

**GitHub Secrets necessários:** `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PORT`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`

> **Nota:** As chaves de API de IA (Anthropic, OpenAI, etc.) **não ficam no `.env` da VPS** — são armazenadas encriptadas no banco e carregadas dinamicamente via `getAiConfig()`. O `ANTHROPIC_API_KEY` no `.env` é opcional (fallback se a config do banco estiver vazia).

---

## Limitações Conhecidas

- **Single-tenant**: um escritório por instância. Multi-tenant não implementado.
- **pgvector obrigatório para RAG**: sem `VECTORS_DATABASE_URL` com a extensão, a base de conhecimento não indexa (demais módulos funcionam normalmente).
- **Evolution API externa**: WhatsApp depende de instância Evolution self-hosted configurada pelo admin.
- **Embeddings pagos**: OpenAI text-embedding-3-small ou Voyage AI — ambos exigem chave paga.
- **Turbopack instabilidade**: se travar em dev, usar `npm run dev:webpack`.
- **CSP restritiva**: iframes de terceiros precisam ser adicionados em `frame-src` no `next.config.ts`.
- **WhatsApp debounce**: mensagens rápidas em sequência são agrupadas (3s) antes do LLM processar.
