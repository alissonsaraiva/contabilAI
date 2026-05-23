---
name: project_branding_dinamico
description: Padrão de branding dinâmico — como propagar nome/slogan da empresa sem hardcodar strings fixas. Produto se chama AVOS (rebrandeado de ContabAI em 2026-03-30)
type: project
---

## Regra central

**O produto agora se chama AVOS (rebrandeado de ContabAI em 2026-03-30).**

**Nunca hardcodar "ContabAI" ou "AVOS" em UI, emails, prompts ou metadata.** O nome da empresa vem sempre do banco via `getEscritorioConfig()` ou `NEXT_PUBLIC_APP_NAME` como último fallback.

## Fonte de verdade

- **Modelo**: `Escritorio` no banco (`prisma/schema.prisma`)
  - `nome` — nome curto (ex: "Avos Digital")
  - `nomeFantasia` — nome completo com tagline (ex: "Avos Digital — Contabilidade Inteligente")
  - `metaDescricao` — descrição SEO
- **Helper server-side**: `getEscritorioConfig()` em `src/lib/escritorio.ts` (cached por request React)
- **Configurável em**: CRM → Configurações → Identidade (sem necessidade de redeploy)

## Padrão por tipo de código

| Tipo | Como usar |
|---|---|
| Server components / API routes | `const escritorio = await getEscritorioConfig()` |
| Metadata (`layout.tsx`) | `generateMetadata()` async — usa `getEscritorioConfig()` |
| Client components com prop | Server parent busca escritório e passa `nomeEscritorio` como prop |
| Client components sem prop (fallback) | `process.env.NEXT_PUBLIC_APP_NAME ?? 'ContabAI'` |

## Onde está implementado (2026-03-28)

- `src/app/layout.tsx` → `generateMetadata()` — título/descrição da aba
- `src/app/(public)/page.tsx` → nav + footer da landing page
- `src/app/(auth)/login/page.tsx` → server wrapper + `_login-form.tsx` (client)
- `src/app/(portal)/portal/login/page.tsx` → server wrapper + `_login-form.tsx` (client)
- `src/app/(portal)/portal/verificar/page.tsx` → server wrapper + `_verificar-content.tsx` (client)
- `src/components/portal/portal-header.tsx` → aceita `nomeEscritorio: string` como prop
- `src/app/(portal)/portal/(autenticado)/layout.tsx` → busca e passa para `PortalHeader`
- `src/app/api/portal/chat/route.ts` → system prompt da Clara usa `escritorio.nome`
- `src/lib/ai/agent.ts` → system prompt do agente operacional usa `escritorio.nome`
- `src/components/crm/novo-usuario-drawer.tsx` → mensagem WhatsApp usa `NEXT_PUBLIC_APP_NAME`
- `src/components/onboarding/chat-widget.tsx` → footer usa `NEXT_PUBLIC_APP_NAME`

## Padrão para páginas client (extração de form)

Páginas `'use client'` que precisam do nome devem ser refatoradas:
1. Extrair lógica client para `_<nome>-form.tsx` com `'use client'`
2. `page.tsx` vira server component async que busca escritório e passa `nome` como prop

**Why:** Produto será white-label (domínio `avos.digital`); nome do escritório deve ser configurável pelo admin sem redeploy.
**How to apply:** Ao criar qualquer nova tela, email ou prompt de IA, sempre usar `getEscritorioConfig()` ou a prop vinda do server — nunca string literal "ContabAI".
