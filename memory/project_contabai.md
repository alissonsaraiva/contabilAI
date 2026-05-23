---
name: AVOS — Contexto do Projeto
description: Visão geral do projeto AVOS (avos.digital) — stack, arquitetura, módulos, subdomínios — v3.9.5+
type: project
---

**Projeto:** AVOS (avos.digital) — plataforma SaaS de contabilidade com IA
**Nome anterior:** ContabAI (rebrandeado para AVOS em 2026-03-30)
**Fundadores:** Alisson (engenheiro de software) + sócio contador (CRC)
**Público-alvo:** MEI, EPP, autônomos, clínicas, serviços em Eusébio/Fortaleza-CE

**Stack:**
- Next.js 16.2.1 + App Router + `output: standalone`
- React 19.2.4, TypeScript 5, Tailwind CSS 4 (não v3), Shadcn/UI
- Prisma 7.5.0 com adapter pg direto (não Prisma Accelerate)
- PostgreSQL + pgvector (banco vetores separado: `VECTORS_DATABASE_URL`)
- NextAuth 5 (beta) — duas instâncias independentes (CRM e Portal)
- Storage: Cloudflare R2 / S3 (`src/lib/storage.ts`)
- Monitoramento: Sentry 10 (`@sentry/nextjs`)

**Deploy:** Hostinger VPS KVM1 (Ubuntu 24.04 + Docker)
**VPS:** `82.25.79.193` — usuário deploy, Docker, Traefik
**Domínio:** `avos.digital` (DNS → IP da VPS)

**Infraestrutura na VPS:**
- PostgreSQL: porta 32769 (banco `contabil_ia`)
- n8n: rodando na VPS
- Evolution API: porta 42572 (WhatsApp Business)
- DocuSeal: porta 32825 (assinatura self-hosted)
- Traefik: proxy reverso com Let's Encrypt

**Versão atual:** v3.9.5+

## Três contextos (subdomínios isolados)

| Subdomínio | Rota | Usuário |
|---|---|---|
| `crm.avos.digital` | `/crm/*` | Contadores e admins (NextAuth CRM) |
| `portal.avos.digital` | `/portal/*` | Clientes e sócios (NextAuth Portal) |
| `avos.digital` | `/onboarding/*` | Leads / público (sem auth) |

Isolamento via `src/proxy.ts` (Edge runtime). **Nunca criar `src/middleware.ts`** — coexistência causa build error nesta versão do Next.js.

## Módulos principais (v3.9.5)

- **CRM:** leads, clientes, empresas, OS, emails (IMAP), comunicados, financeiro (Asaas), relatórios, agente IA
- **Portal:** dashboard, documentos, financeiro, OS, chat Clara (IA), notificações PWA
- **Onboarding:** simulador → plano → dados (CNPJ auto-fill) → sócios → contrato → assinatura
- **IA:** 4 canais independentes + agente com 60+ tools + RAG híbrido (dense+BM25+RRF)
- **WhatsApp:** Evolution API self-hosted + debounce 3s + atendimento humano + transcrição de áudio
- **Asaas:** cobranças PIX/boleto, inadimplência, webhook, 2ª via, sincronização

## Configuração central

`getEscritorioConfig()` em `src/lib/escritorio.ts` — fonte de verdade para configs do escritório.
Todas as chaves sensíveis (IA, email, Asaas, Evolution) ficam no modelo `Escritorio` do banco, encriptadas com AES-256-GCM via `src/lib/crypto.ts`.

**Branding dinâmico:** nome/slogan vêm do banco — nunca hardcodar "AVOS" ou "ContabAI" em UI visível ao usuário.

## O que foi implementado (histórico de versões relevante)

- ✅ v3.2.0: portal refatorado (Empresa, Documentos, Suporte/OS, Config, PWA)
- ✅ v3.3.0: arquitetura unificada de documentos (7 serviços, PJ/PF split)
- ✅ v3.5.0: RAG híbrido (dense+BM25+RRF), similarity thresholds, novos ingestores
- ✅ v3.8.28: layout WhatsApp Web no módulo de atendimentos
- ✅ v3.9.1: campos completos CRM/portal + edição portal + fix drawer WhatsApp
- ✅ v3.9.5: classificação + resumo IA de documentos + audit S3

**Why:** README completamente reescrito em 2026-03-31 para refletir o estado real do projeto v3.9.5+.
**How to apply:** Usar como referência de contexto geral ao iniciar qualquer tarefa. Produto = AVOS. Branding sempre via `getEscritorioConfig()`.
