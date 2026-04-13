# AVOS — Índice da Documentação do Sistema
> **Versão**: v3.10.46 | **Atualizado**: 2026-04-12 | **Fonte da verdade**: código-fonte
>
> 📄 **Documentação específica:** [WhatsApp — Fluxo Completo](./WHATSAPP.md)
>
> 📊 **Cobertura**: 18 arquivos · 4.200+ linhas · 100% da lógica de negócio e infraestrutura documentados

---

## 📌 Visão Geral

**AVOS** é uma plataforma SaaS de gestão para escritórios de contabilidade com três faces:

1. **CRM interno** — gestão de clientes, leads, finanças, documentos, NFS-e, atendimentos
2. **Portal do cliente** — acesso via magic link/OTP para cobranças, documentos, NFS-e, chamados e IA "Clara"
3. **Onboarding público** — widget conversacional que captura prospects e inicia a contratação

---

## 🏗️ Stack Técnica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Framework | Next.js (App Router) | 16.2.1 |
| UI | React + Tailwind CSS 4 | 19.2.4 |
| ORM | Prisma | 7.5.0 |
| Banco | PostgreSQL 17 + pgvector 0.8.2 | — |
| Linguagem | TypeScript | 5.x |
| IA | Claude Haiku 4.5 (padrão) + OpenAI + Gemini (fallback automático) | — |
| Áudio | Groq Whisper (transcrição de PTT WhatsApp) | — |
| Storage | Cloudflare R2 (S3-compatible) | — |
| Deploy | Docker + VPS (6 containers) via ghcr.io | — |
| Monitoramento | Sentry (client + server + edge) + healthchecks.io (crons) | — |
| MCP Sentry | `@sentry/mcp-server` via stdio no `.mcp.json` — acesso direto a issues/eventos do Claude Code | — |
| Auth CRM | NextAuth.js (credentials) | — |
| Auth Portal | Magic link + OTP WhatsApp + sessions | — |

---

## 🗺️ Camadas do Sistema

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

---

## 📚 Documentação por Feature

| Arquivo | Conteúdo |
|---------|----------|
| [features/ONBOARDING.md](./features/ONBOARDING.md) | Etapas do wizard, APIs públicas, validações, auto-save, webhook ZapSign, conversão Lead→Cliente |
| [features/NFSE.md](./features/NFSE.md) | Fluxo CRM + portal + Spedy, webhook, reconciliação, cancelamento/reemissão, componentes |
| [features/COBRANCA.md](./features/COBRANCA.md) | Asaas: provisioning, subscription, webhook, notificações, segunda via, inadimplentes |
| [features/CHAMADOS.md](./features/CHAMADOS.md) | Abertura, atendimento, resolverOS (7 passos), ChamadoNota, escalação, badge IA/Humano |
| [features/EMAIL.md](./features/EMAIL.md) | IMAP sync, threading, resiliência, rotas, cron |
| [features/PORTAL.md](./features/PORTAL.md) | Auth (magic link/OTP), páginas, dashboard v3.10.22, Suspense streaming |
| [features/IA.md](./features/IA.md) | 4 canais, 64 tools (catálogo completo), providers + fallback (circuit breaker 2min), pipeline `askAI` (7 passos), guardrails, RAG thresholds, registry de tools |
| [features/DOCUMENTOS.md](./features/DOCUMENTOS.md) | criarDocumento, resumo IA, notificações, histórico, comunicados, PDF/contratos, relatórios |
| [features/INFRA.md](./features/INFRA.md) | Storage/R2, Crypto/AES-256-GCM, Rate Limiter, XML Parser, Evolution API (circuit breaker), mídia WA, Spedy, ClickSign |
| [features/ROTAS.md](./features/ROTAS.md) | Dashboard, CNPJ, upload genérico, contatos, inadimplentes em lote, portal session/verificar/escalação, hooks React |
| [features/SCHEMA.md](./features/SCHEMA.md) | Hierarquia de entidades, enums críticos, decisões de arquitetura |
| [features/INTEGRACOES.md](./features/INTEGRACOES.md) | Asaas, Spedy, Evolution, R2, Zapsign/Clicksign, DocuSeal, SERPRO, Anthropic — pontos de falha |
| [features/CONFIG.md](./features/CONFIG.md) | Env vars, setup local, pre-deploy checklist, crons + healthchecks, infra VPS |
| [features/SAUDE.md](./features/SAUDE.md) | Limitações, fluxos frágeis, inconsistências, lacunas remanescentes, sugestões, histórico de bugs |
| [features/USUARIOS.md](./features/USUARIOS.md) | Perfis (admin/contador/assistente), permissões de menu por role, JWT, middleware, UI de configuração |
| [WHATSAPP.md](./WHATSAPP.md) | Pipeline WhatsApp completo (pipeline modular, identificação de contatos, mídia) |

---

## 📁 Estrutura de Pastas

```
contabilAI/
├── prisma/
│   ├── schema.prisma          # Schema unificado (~1010 linhas, 31+ modelos)
│   ├── migrations/            # 36+ arquivos SQL (histórico desde v1.0)
│   ├── seed.ts                # Seed de planos iniciais
│   └── init-vectors.sql       # Setup pgvector + índices HNSW
├── docs/
│   ├── SISTEMA.md             # Este arquivo — índice navegável
│   ├── WHATSAPP.md            # Pipeline WhatsApp completo
│   └── features/              # Documentação por feature (14 arquivos)
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
│   │   ├── email/             # IMAP, SMTP, threading
│   │   ├── whatsapp/          # Pipeline WhatsApp modular
│   │   ├── whatsapp-utils.ts  # buildRemoteJid, checkRateLimit, isMediaUrlTrusted
│   │   ├── rag/               # RAG ingestores + store
│   │   ├── services/          # asaas-sync, notas-fiscais, chamados, etc.
│   │   ├── schemas/           # Schemas Zod de validação
│   │   ├── asaas.ts           # Client da API Asaas
│   │   └── event-bus.ts       # EventEmitter para comunicação interna
│   ├── proxy.ts               # Middleware de subdomínio ⚠️ USAR ESTE
│   ├── middleware.ts           # ⚠️ DESCONTINUADO — não tocar
│   └── instrumentation*.ts    # Setup Sentry (client/server/edge)
├── .env.example               # Template de variáveis
└── AGENTS.md                  # Regras para agentes de IA
```

---

## 🔌 Roteamento por Subdomínio

**Arquivo**: `src/proxy.ts` (⚠️ NÃO usar `src/middleware.ts` — causa build error)

- `crm.avos.digital` → rewrite para `/(crm)/...`
- `portal.avos.digital` → rewrite para `/(portal)/...`
- `avos.digital` → landing/onboarding público

### Proteção de rotas CRM (`src/proxy.ts`)

Três camadas em sequência:
1. **Tipo de usuário**: apenas `admin`, `contador` ou `assistente` entram no CRM
2. **Configurações**: `/crm/configuracoes` bloqueado para não-admin (hard rule)
3. **Permissões de menu**: `resolverPermissoes(token.menuPermissoes)` + `podeAcessarRota()` — redireciona para `/crm/acesso-negado` se não autorizado

`ROTAS_LIVRES` (bypass da verificação de menu): `/crm/acesso-negado`, `/crm/trocar-senha`, `/crm/dashboard`

---

## 🔒 Regras Imutáveis

| Regra | Motivo |
|-------|--------|
| NUNCA `prisma db push` | Bypassa migrations → erros P2022 em produção |
| NUNCA tocar `src/middleware.ts` | Coexistência com proxy.ts causa build error |
| SEMPRE `try/catch` explícito | Zero erros silenciosos — regra de produção |
| SEMPRE `Sentry.captureException()` nos catch | Rastreabilidade em produção |
| Build local antes de commit | Deploy CI falha por erros TS |
| Deploy exige tag `v*` | `git push origin main` sozinho não dispara CI |
| Cron VPS = config manual | Deploy não configura crontab automaticamente |

---

## 📐 Convenções de Código

- Componentes client: `"use client"` no topo
- APIs protegidas: `getServerSession()` antes de qualquer operação
- Webhooks: verificar `WebhookLog` para idempotência
- Interações: sempre registrar via `registrarInteracao()` para feed de atividades
- Notificações: `criarNotificacao()` para alertas no sino do CRM
- **Server Components** — páginas carregam dados no servidor por padrão
- **Route Handlers** — toda lógica de negócio em `/api/**`
- **Migrations via Prisma** — NUNCA `db push`, sempre `migrate dev --name <nome>`

---

## 🖥️ Infra VPS

- **Host**: `82.25.79.193`
- **Usuário deploy**: `deploy`
- **PostgreSQL**: porta `32768`
- **DocuSeal**: porta `32825` (single point of failure)
- **CI/CD**: ghcr.io → 6 containers Docker (disparado por tag `v*`)
- **Backup**: automático (verificar configuração)
