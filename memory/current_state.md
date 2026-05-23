---
name: Estado Atual do Sistema
description: Snapshot rápido da versão, último deploy, features recentes e bloqueios — atualizar a cada sessão produtiva
type: project
---

# Estado Atual — AVOS

> Atualizar sempre que houver deploy, feature nova ou mudança significativa.

**Versão atual:** v3.10.70
**Último commit:** fix PWA — safe area no header + wordmark no splash screen
**Data:** 2026-04-17
**Branch:** main

---

## Features das últimas 5 versões

| Versão | O que entrou |
|--------|-------------|
| v3.10.70 | Safe area no header iOS (pt-safe) + wordmark "Avos" no splash screen |
| v3.10.69 | Splash screen tags movidas para root layout como HTML estático (garantia em todas as páginas) |
| v3.10.68 | Fix splash screen PWA (layout intermediário → root layout) + nav portal unificado (remove Empresa/Suporte + isPwa) + manifest background_color corrigido |
| v3.10.67 | Fix email IMAP IPv4 forçado + circuit breaker 15min + intervalo 5min |
| v3.10.63 | Fix definitivo delete mensagem WhatsApp: usar `waKey.remoteJid` (JID original da key) ao invés de `conversa.remoteJid` — números BR têm formato diferente (8 vs 9 dígitos) |
| v3.10.62 | Logs de debug no fluxo de deleção de mensagem WhatsApp |
| v3.10.61 | Tab "Sócios" removida da ficha do cliente (exclusivo na empresa); sócio WhatsApp fallback via CPF; ConfirmDialog para exclusão de lista de transmissão |
| v3.10.60 | Sync bidirecional sócio↔cliente por CPF (email/telefone/whatsapp); novo `src/lib/clientes/sync-contato-cpf.ts` |
| v3.10.59 | WhatsApp exclusivamente via campo `whatsapp` — removido fallback para `telefone` em 16 rotas/componentes |
| v3.10.58 | Broadcast retry: até 3 tentativas por destinatário; campo `tentativas` no schema; status marcado antes de operações secundárias |
| v3.10.57 | WhatsApp delete fix: endpoint `/chat/deleteMessageForEveryone/` (era `/chat/message/`); `whatsappMsgData` salvo nas rotas POST de clientes e sócios |
| v3.10.56 | Listas de transmissão (broadcast WhatsApp): 4 modelos Prisma, 8 rotas API, cron processar-envios, UI com tabs Conversas/Listas no painel de atendimentos, CRUD listas+membros, composição+envio, histórico com status por destinatário, persistência na conversa individual (IA tem contexto), delay anti-ban 3s |
| v3.10.54 | Multi-operador: operadorId em MensagemIA, atribuidaParaId+atribuidaEm em ConversaIA e Interacao; nome do operador no chat (bolha + avatar iniciais); dropdown atribuição no header do chat e no painel de e-mail; filtro "Você" por atribuição real; badge de atribuição nos cards de atendimento; migration 20260414120000 |
| v3.10.53 | WhatsApp bloco único sem quebra artificial |
| v3.10.52 | Portal troca empresa: window.location.assign (RSC cache stale fix), validação sócio por CPF, user.id/name atualizado no JWT, notas-fiscais usa user.empresaId (não cliente.empresa), layout catch log |
| v3.10.51 | Comunicados: paginação server-side, tabs ativos/expirados/rascunhos, filtro tipo+busca, agrupamento por ano, badge alcance, 7 bugs corrigidos (NaN, memory leak, input desincronizado, catch vazios + Sentry) |
| v3.10.50 | Fix definitivo histórico WhatsApp: sort global por criadaEm após flatMap; leads corrigido de at(-1) para reduce(atualizadaEm) |
| v3.10.48 | Email HTML (iframe sandboxed + DOMPurify), polling 60s com banner novos emails, badge urgência 48h, race-condition fix (carregarVersionRef) em portal+WhatsApp, Sentry em 5 catch blocks portal |
| v3.10.47 | Quality gates: ESLint no-empty + no-floating-promises + noUncheckedIndexedAccess; compliance fixes em 112 arquivos; mapa de módulos no AGENTS.md |
| v3.10.46 | Auditoria de catch vazios: ~75 catch blocks corrigidos em 59 arquivos (RAG, cron, tools IA, webhooks, portal, onboarding) |
| v3.10.45 | Fix histórico WhatsApp /atendimentos: carregar() no finally + mismatch GET/POST conversaAtual + varredura em portal e notas fiscais |
| v3.10.44 | Fix renderização de arquivos no chat portal CRM (PortalConversaPanel) e portal do cliente (portal-clara) |
| v3.10.43 | Fix histórico arquivos /atendimentos (router.refresh no finally), texto após arquivos como msg separada |
| v3.10.42 | Multi-empresa compat, R2 URL assinada, fix portal chat |
| v3.10.39 | Busca accent-insensitive em todo CRM + IAs + APIs |
| v3.10.38 | Multi-empresa 1:N, documentos v2, fix cobrança gentil |
| v3.10.37 | Refactor: componentiza 7 arquivos (~4000 linhas reduzidas) |
| v3.10.36 | Substitui Movimentações por Conversas Recentes na dashboard |

---

## Em progresso

- **Multi-empresa 1:N** — migração Cliente↔Empresa de 1:1 para 1:N (43 arquivos, 4 fases) — compatibilidade implementada, migração de dados pendente

---

## Bloqueios conhecidos

- Nenhum bloqueio ativo no momento

---

## Débito técnico prioritário

- Webhook WhatsApp sem validação de autenticidade
- Lock WhatsApp (`processandoEm`) sem timeout/expiração
- `docs/ia-arquitetura.md` desatualizado
- Typo `atudalizarDadosCliente` na tool de IA
- ~~Catch vazios em 59 arquivos~~ **RESOLVIDO v3.10.46**

---

## Infra

- VPS: 14 GB disco livre (auditado 2026-04-03)
- 6 containers Docker rodando
- Sentry + healthchecks.io operacionais

## Tooling

- **Sentry MCP** configurado em `.mcp.json` via `@sentry/mcp-server` (stdio, token no arquivo)
  - Org: `alisson-sb`, Projeto: `avos`
  - 20+ tools disponíveis: `list_issues`, `analyze_issue_with_seer`, `update_issue`, etc.
- **context7 MCP** adicionado ao `.mcp.json` via `@upstash/context7-mcp` (sem API key)
  - Resolve docs atualizadas de Next.js, Prisma, shadcn durante desenvolvimento
- `.mcp.json` está no `.gitignore`

## Qualidade de código (melhorias recentes)

| Config | Regra | Efeito |
|--------|-------|--------|
| `eslint.config.mjs` | `no-empty: error` (allowEmptyCatch: false) | Catch vazio vira erro de lint |
| `eslint.config.mjs` | `@typescript-eslint/no-floating-promises: error` | Promise solta vira erro de lint |
| `tsconfig.json` | `noUncheckedIndexedAccess: true` | Acesso a array/objeto sem verificação vira erro TS |
| `AGENTS.md` | Mapa de Módulos Críticos | 5 grupos documentados com dependências cruzadas reais |
| Husky pre-commit | `tsc --noEmit && eslint src/` | **PENDENTE** — gates automáticos por commit |
