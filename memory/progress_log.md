---
name: Log de Progresso entre Sessões
description: O que foi feito, ficou pendente e qual o próximo passo natural — atualizar ao final de cada sessão produtiva
type: project
---

# Log de Progresso

> Atualizar ao final de cada sessão. Manter apenas as últimas 5-8 entradas para não crescer infinitamente.

---

## 2026-04-17 — v3.10.68–70: PWA splash screen + navegação portal + safe area

**O que foi feito:**

**v3.10.68 — Splash screen + nav:**
- Criado `src/app/(portal)/portal/layout.tsx` como pai de todo o portal (appleWebApp metadata)
- Navegação unificada: removidos "Empresa" e "Suporte" do nav em browser e PWA
- `isPwa`, `useEffect`, `PWA_HIDDEN` removidos de `portal-header.tsx`
- `manifest.ts` `background_color` corrigido `#ffffff` → `#0C2240`
- Adicionada entry iPhone 14 padrão (390×844 @3x); removida entry morta iphone-14-pro-max

**v3.10.69 — Tags como HTML estático:**
- Abordagem via `generateMetadata` em layout intermediário não garantia presença no HTML
- `apple-touch-startup-image` + `apple-mobile-web-app-capable` movidos para `<head>` do root `layout.tsx` como HTML estático (mesmo padrão do Google Fonts)
- Splash confirmado funcionando no iPhone 15

**v3.10.70 — Safe area + wordmark:**
- Header: `pt-safe` + div interno `h-16` — ícone/logout não ficam mais atrás da barra de status iOS
- `.pt-safe` adicionado ao `globals.css` (segue padrão `.pb-safe`)
- `gen-splash.mjs`: SVG estendido para `512×560` com texto "Avos" abaixo do ícone; resize proporcional por largura
- 16 PNGs regenerados e commitados

**Próximo passo natural:**
- Testar safe area e wordmark no dispositivo físico após deploy v3.10.70

---

## 2026-04-14 — v3.10.57–63: fixes WhatsApp delete, broadcast retry, sync CPF, campo whatsapp

**O que foi feito:**

**v3.10.57 — WhatsApp delete fix (parcial):**
- Endpoint de exclusão corrigido: `/chat/message/` → `/chat/deleteMessageForEveryone/`
- Rotas POST de clientes e sócios agora persistem `whatsappMsgData` em `MensagemIA`

**v3.10.58 — Broadcast retry:**
- Retry automático de até 3 tentativas por destinatário no broadcast
- Campo `tentativas` adicionado ao schema `DestinatarioEnvio`
- Status marcado como enviado/falhou **antes** de operações secundárias — evita duplicata no WhatsApp

**v3.10.59 — WhatsApp só usa campo `whatsapp`:**
- Removido fallback para `telefone` em 16 rotas/componentes

**v3.10.60 — Sync bidirecional sócio↔cliente por CPF:**
- email/telefone/whatsapp sincronizados quando sócio e cliente compartilham CPF

**v3.10.61 — Sócio WhatsApp fallback + Tab Sócios removida:**
- Se `socio.whatsapp` vazio, busca `cliente.whatsapp` via CPF
- ConfirmDialog para exclusão de lista de transmissão

**v3.10.62 — Logs debug delete mensagem:**
- Adicionados `console.log` em cada etapa do fluxo de deleção para diagnosticar bug

**v3.10.63 — Fix definitivo delete mensagem WhatsApp:**
- **Causa raiz:** `deleteMessage` usava `conversa.remoteJid` mas deveria usar `waKey.remoteJid`. Números brasileiros têm formato diferente: conversa=`5585981186338` vs key=`558581186338` (sem o 9). REVOKE com JID errado era ignorado silenciosamente pelo WhatsApp (API retorna 201 sucesso).
- **Fix:** usar `waKey.remoteJid` com fallback para `conversa.remoteJid`
- Docs WHATSAPP.md e known_issues_patterns.md atualizados

**Pendente — REMOVER DEPOIS:**
- `console.log` de debug em `sendText` e na rota de delete — remover após confirmar que exclusão está funcionando

**Próximo passo natural:**
- Testar exclusão de mensagens em produção com v3.10.63
- Remover os `console.log` de debug após confirmação

---

## 2026-04-14 — Listas de Transmissão WhatsApp (broadcast)

**O que foi feito:**
- Feature completa de listas de transmissão (broadcast) na tela de atendimentos
- **Schema:** 4 novos modelos Prisma (ListaTransmissao, MembroListaTransmissao, EnvioTransmissao, DestinatarioEnvio) + 2 enums + migration SQL
- **API:** 8 rotas REST (CRUD listas, CRUD membros, disparar envio, histórico, cron processar)
- **Processador async:** `src/lib/broadcast/processar-envios.ts` — processa fila de broadcast com delay 3s anti-ban, persiste MensagemIA na conversa individual (IA tem contexto), emite SSE
- **UI:** Tabs "Conversas/Listas" no painel esquerdo do atendimentos; ListasTab (CRUD + listagem); ListaDetalhe com 3 abas (Membros, Enviar, Histórico); busca de contatos para adicionar membros; composição com texto+arquivo; histórico expandível com status por destinatário
- **Proteções:** limite 50 membros/lista, 1 broadcast por vez por lista, validação MIME, Sentry em todos catches
- **Docs:** WHATSAPP.md atualizado com seção completa de broadcast
- tsc sem erros, build sem erros, lint limpo

**Pendente para deploy:**
- Configurar cron na VPS: `/api/crm/listas-transmissao/processar-envios` (4x/min)
- Criar check no healthchecks.io: `HC_PROCESSAR_ENVIOS_BROADCAST`
- Aplicar migration no banco: `prisma migrate deploy`
- Tag v3.10.56

**Próximo passo natural:**
- Commit + tag + deploy

---

## 2026-04-13 — Fix upload arquivos CORS R2 (v3.10.51)

**O que foi feito:**
- Sentry AVOS-N: `TypeError: Failed to fetch (*.r2.cloudflarestorage.com)` ao anexar imagem no chat
- Causa: upload via URL presignada (PUT direto do browser ao R2) bloqueado por CORS não configurado
- Fix: `/api/upload` aceita `multipart/form-data` e faz upload server-side com `uploadArquivo()`
- 5 callers atualizados: `use-whatsapp-chat.ts`, `conversa-rodape.tsx`, `portal-conversa-panel.tsx`, `portal-chat-drawer.tsx`, `escalacao-responder.tsx`
- Docs: `ROTAS.md` + `known_issues_patterns.md` atualizados
- tsc: sem erros; commit v3.10.51 criado (deploy pendente)

**Próximo passo natural:**
- `git tag v3.10.51 && git push origin main v3.10.51` para disparar CI

---

## 2026-04-13 — Portal: fix completo de troca de empresa ativa (clientes + sócios)

**O que foi feito:**
- Diagnóstico e correção de 4 bugs no fluxo de troca de empresa ativa do portal
- **`empresa-selector.tsx`:** substituído `router.refresh()` por `window.location.assign(pathname)` — o `router.refresh()` não invalida o RSC cache de forma confiável na 2ª+ chamada, fazendo as seções mostrarem dados stale
- **`trocar/route.ts` — validação sócio:** validação com `{ id: user.id, empresaId: novaEmpresaId }` nunca batia (cada empresa tem `Socio.id` distinto). Corrigido para lookup por CPF via `novoSocio = findFirst({ cpf, empresaId: novaEmpresaId, portalAccess: true })`
- **`trocar/route.ts` — JWT sócio:** `user.id` e `user.name` agora são atualizados para o registro `Socio` da nova empresa. Sem isso, `portal/chat/route.ts` retornava 403 após a troca
- **`trocar/route.ts` — `empresaIds` sócio:** era reduzido a `[novaEmpresaId]`; agora busca todos via CPF — seletor não desaparece mais após primeira troca
- **`notas-fiscais/page.tsx`:** substituído `cliente.empresa` (relação legada 1:1) por `prisma.empresa.findUnique({ where: { id: user.empresaId } })` — página exibia CNPJ/razão social da empresa original mesmo após trocar
- **`layout.tsx`:** catch do `JSON.parse(user.empresaIds)` tinha `/* fallback vazio */` sem log — adicionado `console.error` rastreável
- `docs/features/PORTAL.md` atualizado com todas as regras e anti-patterns do cenário

**Decisões tomadas:**
- Para sócios, o identificador canônico entre empresas é o CPF (único campo que vincula os registros Socio de uma mesma pessoa)
- `window.location.assign` é preferível a `router.refresh()` em qualquer troca que altera o JWT — garante full SSR sem depender do comportamento do RSC cache
- Qualquer página portal que precise de dados da empresa ativa deve usar `user.empresaId` (nunca `cliente.empresa`)

**Próximo passo natural:**
- Deploy com tag após testar troca de empresa em produção

---

## 2026-04-13 — Módulo Comunicados: layout escalável + code review + bugs corrigidos

**O que foi feito:**
- Refatoração completa da página `/crm/comunicados` para suportar crescimento ao longo do tempo
- **Paginação server-side:** 20 por página via `searchParams` (`pagina`)
- **3 seções via tabs:** ativos / expirados / rascunhos — lógica correta de filtro por `publicado` + `expiradoEm` vs `agora`
- **Filtro por tipo** (informativo/alerta/obrigação/promoção) + **busca por título** — ambos server-side via Prisma
- **Agrupamento por ano** — dividers visuais dentro de cada seção
- **Badge de alcance** — `_count.envios` por comunicado (label: "emails disparados")
- **3 novos componentes client:** `ComunicadosFiltros`, `ComunicadosPaginacao`, + page refatorada
- **Code review + bugs corrigidos:**
  - `parseInt` NaN — `isNaN(pageNum) ? 1 : Math.max(1, pageNum)`
  - Timer memory leak — `useEffect` com cleanup no `ComunicadosFiltros`
  - Input busca desincronizado — `useState` + `useEffect(buscaAtual)` controlado
  - `handleSecao` apagava filtros — agora usa `navegar()` e preserva tipo/busca
  - `ComunicadoUnpublishButton` sem loading state nem Sentry — corrigido
  - `ComunicadoPublishButton` e `ComunicadoDeleteButton` com catch vazio — Sentry adicionado
  - `ComunicadoForm` catch vazio — Sentry adicionado
  - `aria-label` + `aria-hidden` na paginação
- `docs/features/DOCUMENTOS.md` atualizado com seção completa de Comunicados
- tsc + build: sem erros

**Decisões tomadas:**
- Contadores das tabs mostram total da seção independente dos filtros de tipo/busca
- `_count.envios` conta todos os envios (pendentes + falhos) — label "emails disparados" (não "notificados")
- `as const` em objetos Prisma where é incompatível com `ComunicadoWhereInput` — usar type annotation explícita

**Próximo passo natural:**
- Deploy com tag `v3.10.51` quando pronto

---

## 2026-04-13 — Causa raiz real do histórico WhatsApp (v3.10.50) + investigação VPS

**O que foi feito:**
- Investigação direta na VPS após constatar que o bug persistia mesmo com os fixes de v3.10.48/49
- VPS confirmada com código atualizado (imagem buildada no dia, processo único `next-server PID 1`)
- Confirmado na DB: mensagens estavam sendo salvas corretamente (incluindo "boa tarde", "oi oi")
- **Causa raiz real:** flatMap sem sort global — conversas ordenadas por `criadaEm` da *conversa*, não das mensagens. Conversa `be73ec97` (criada 02/04) tinha msgs até 13/04; conversa `c49c7267` (criada 05/04) tinha msgs só até 05/04. Flatmap: msgs de hoje apareciam no meio do array e msgs de 05/04 ficavam no "fundo". Painel auto-scrollava para o fundo = mensagens antigas. Usuário não via as recentes, que estavam fora do viewport acima.
- **Fix:** `.sort((a,b) => criadaEm)` após flatMap em clientes, socios e leads/whatsapp
- Leads também corrigido de `conversas.at(-1)` → `reduce(atualizadaEm)` (v3.10.45 não havia corrigido esta rota)
- Docs `WHATSAPP.md` atualizadas com aviso crítico no GET e na seção de limitações
- `project_vps_access.md` atualizado com: tabelas corretas (conversas_ia, mensagens_ia), erros de escape encontrados, padrão correto de psql sem bash -c, consultas de diagnóstico WhatsApp, verificação de versão deployada
- `known_issues_patterns.md` atualizado com causa raiz definitiva e como diagnosticar na VPS
- Deploy: tag v3.10.50

**Erros de VPS encontrados nesta sessão (documentados no project_vps_access.md):**
- `bash -c` com aspas duplas via ssh causa `unexpected EOF` — usar `psql` direto no container
- `"ConversaIA"` → `relation does not exist` — tabela real é `conversas_ia`
- `remote_jid` → `column does not exist` — coluna real é `"remoteJid"` (camelCase com aspas)

**Próximo passo natural:**
- Testar em produção: enviar mensagem do painel de Atendimentos e confirmar que aparece imediatamente no histórico e em posição cronológica correta

---

## 2026-04-13 — Fix definitivo histórico WhatsApp/Portal (v3.10.48)

**O que foi feito:**
- Diagnosticada causa raiz real do bug recorrente de mensagem aparecer na sidebar mas não no painel de chat
- **Causa raiz:** `sendText` tem retry `[0, 5s, 15s, 45s]` + timeout 15s → worst case 125s. Nginx corta browser em ~60s. `carregar()` do `finally` roda antes da mensagem ser salva no DB. Servidor salva depois; sidebar atualiza via AutoRefresh (30s) mas painel sem trigger.
- **Fix principal:** `emitWhatsAppRefresh(conversa.id)` adicionado após `prisma.mensagemIA.create()` em `/api/clientes/[id]/whatsapp/route.ts` e `/api/socios/[id]/whatsapp/route.ts`. SSE persiste após timeout do POST — painel atualiza quando servidor salva.
- **Fixes de race condition:** `carregarVersionRef` em `use-whatsapp-chat.ts` e `portal-conversa-panel.tsx` — descarta respostas stale de `carregar()` concorrentes
- **Portal polling:** `sseHealthyRef` adicionado ao polling de `portal-conversa-panel.tsx` (estava sem guard, disparando SSE+polling simultâneos)
- **Browser cache:** `cache: 'no-store'` nos fetches de `carregar()` nos dois componentes
- **Boundary Sentry:** `WhatsAppChatBoundary.componentDidCatch` agora chama `Sentry.captureException`
- **Portal Sentry:** `Sentry.captureException` nos catchs de `assumir`, `reativarIA`, `excluirMensagem`, `enviar`, `handleFileChange` do `portal-conversa-panel.tsx`
- `docs/WHATSAPP.md` atualizado (seções 3, 5, 6, 12)
- `docs/features/PORTAL.md` atualizado (PortalConversaPanel reliability)
- `known_issues_patterns.md` atualizado com causa raiz real
- tsc: sem erros

**Decisões tomadas:**
- Rotas de envio do CRM (`clientes/socios whatsapp POST`) SEMPRE devem emitir `emitWhatsAppRefresh` após `mensagemIA.create()` — sem isso o painel depende só do `carregar()` do `finally` que pode rodar antes do DB write
- `carregarVersionRef` é o padrão para qualquer `carregar()` com SSE/polling concorrentes

**Próximo passo natural:**
- Fazer tag `v3.10.48` e deploy para validar em produção

---

## 2026-04-13 — Qualidade de código: ESLint + TS strict + context7 MCP + mapa de módulos

**O que foi feito:**
- **ESLint** — duas regras novas como `error` em `eslint.config.mjs`:
  - `no-empty` (allowEmptyCatch: false) — catch vazio bloqueia lint
  - `@typescript-eslint/no-floating-promises` — promise solta bloqueia lint (causa raiz do padrão "refresh só no try")
- **TypeScript** — `noUncheckedIndexedAccess: true` em `tsconfig.json` — acesso a array/objeto sem verificação vira erro TS
- **Compliance fixes** (adaptações ao código existente para passar nas novas regras):
  - `use-badges.ts`, `instrumentation-node.ts` — `fn()` → `void fn()` e `setInterval(fn)` → `setInterval(() => void fn())` (no-floating-promises)
  - `utils.ts` — `n[i]` → `n.charAt(i)` em validarCPF/validarCNPJ/getInitials (noUncheckedIndexedAccess)
  - `crypto.ts` — destructuring com type assertion `as [string, string, string]` (noUncheckedIndexedAccess)
  - `rate-limit.ts` — `.split(',')[0]?.trim()` com optional chaining (noUncheckedIndexedAccess)
  - SSE streams (3 rotas) — `eslint-disable-next-line no-empty` com justificativa inline nos catch de controller (exceção documentada)
- **context7 MCP** — adicionado ao `.mcp.json` local via `@upstash/context7-mcp` (sem API key, serviço público). Resolve docs atualizadas de Next.js, Prisma, shadcn
- **Mapa de Módulos Críticos** — nova seção no `AGENTS.md` com 5 grupos baseados em bugs reais:
  - Grupo 1: Chat WhatsApp (finally + GET/POST alignment)
  - Grupo 2: Chat Portal (SSE + tipos com mídia + finally)
  - Grupo 3: NFS-e (finally simétrico nas 3 ações)
  - Grupo 4: RAG CRUD (deleções devem limpar embeddings)
  - Grupo 5: SSE Streams (formato de evento + consumers)
- **AGENTS.md anti-patterns** — itens 8 e 9 adicionados: padrão `void` para promises soltas e `charAt()`/optional chaining para indexação segura
- **docs/SISTEMA.md** — versão bumped para v3.10.46, MCP Sentry adicionado à tabela de stack

**O que ficou pendente:**
- **Husky pre-commit** — item 1 dos 3 planejados, não implementado nesta sessão. Quando feito: `npm install --save-dev husky && npx husky init`, hook rodando `npx tsc --noEmit && npx eslint src/ --max-warnings=0`

**Decisões tomadas:**
- context7-mcp não requer API key (campo `--api-key` do template estava desatualizado)
- shadcn MCP não incluído (não solicitado pelo usuário)
- Mapa de módulos usa apenas bugs com evidência real — sem especulação

**Próximo passo natural:**
- Instalar Husky (item 1 pendente) quando houver disposição para ~30min
- Confirmar que `tsc --noEmit` passa limpo antes de instalar (pré-requisito)

---

## 2026-04-12 — Configuração MCP Sentry

**O que foi feito:**
- Configurado Sentry MCP via `@sentry/mcp-server` (stdio) no `.mcp.json`
- `type: "url"` não funcionou (OAuth não disparava automaticamente no VS Code)
- Solução final: `type: "stdio"` + `npx -y @sentry/mcp-server@latest --access-token <token>`
- 20+ tools do Sentry agora disponíveis no Claude Code
- Testado: `whoami` OK, `list_issues` retornou 7 issues ativos
- `.mcp.json` já estava no `.gitignore`

**Issues ativos encontrados (2026-04-12):**
- AVOS-7: `AggregateError` em `POST /api/email/sync` (6 eventos, 9 dias)
- AVOS-5: Evolution API circuit breaker aberto (3 eventos, 10 dias)
- AVOS-H: `PrismaClientValidationError` em `GET /crm/empresas`
- AVOS-G: Server Component error em `/crm/empresas`
- AVOS-M/K/J: `TypeError: Failed to fetch` recentes (1-2h)

**Próximo passo natural:**
- Investigar AVOS-7 (email sync) e AVOS-H (Prisma empresas) com `analyze_issue_with_seer`

---

## 2026-04-12 — Auditoria e correção de catch vazios em todo src/ (v3.10.46)

**O que foi feito:**
- Auditoria completa de catch blocks problemáticos em todo `src/`
- ~75 catch blocks corrigidos em 59 arquivos, 6 categorias:
  1. `.catch(() => {})` em API routes server-side (12 ocorrências, 11 arquivos) — RAG deleteEmbeddings, cron, config
  2. `.catch(() => null)` em lib/ tools IA e WhatsApp (20 ocorrências, 14 arquivos)
  3. `.catch(() => {})` em componentes client-side (22 ocorrências, 17 arquivos) — onboarding, portal, CRM
  4. `.catch(() => null/[])` em API routes portal (13 ocorrências, 8 arquivos) — PIX refresh, sócio, empresas
  5. `} catch {` sem variável em lib/ server-side (11 ocorrências, 10 arquivos) — email, AI tools, RAG
  6. `} catch {` em componentes e webhooks (10 ocorrências, 8 arquivos) — clicksign, zapsign, asaas
- Todos agora logam com `console.error` + tag de módulo rastreável
- Sentry adicionado em operações críticas onde já estava importado
- `.mcp.json` adicionado ao `.gitignore`
- tsc + build: sem erros
- Deploy: tag v3.10.46

**O que NÃO foi alterado (intencionalmente silencioso):**
- `JSON.parse()` defensivo, `localStorage` SSR safety, `controller.enqueue/close` em streams SSE
- `req.json().catch(() => null)`, `res.json().catch(() => ({}))`, `prisma.count().catch(() => 0)` em layouts

**Decisões tomadas:**
- Catch blocks devem SEMPRE logar o erro, mesmo em fire-and-forget
- Fallbacks `.catch(() => null)` mantêm o `return null` mas agora logam antes
- Streams SSE (`controller.enqueue/close`) são exceção — catch vazio é válido

**Próximo passo natural:**
- Verificar logs em produção após deploy para validar que não há ruído excessivo

---

## 2026-04-12 — Fix histórico WhatsApp chat panel + badge "IA ativa" (v3.10.45)

**O que foi feito:**
- Diagnosticado bug: mensagens do operador não apareciam no painel direito do WhatsApp chat em /atendimentos; badge "IA ativa" persistia após envio
- **Causa raiz:** `carregar()` estava apenas no `try` de `enviar()` em `use-whatsapp-chat.ts`. Quando Evolution API / Nginx fecha a conexão por timeout, fetch lança `TypeError: Failed to fetch`, catch captura mas não chama `carregar()`. Mensagem JÁ salva no banco (painel esquerdo mostrava "IA: teste 3") mas painel direito não atualizava
- **Fix primário:** `carregar()` movido para `finally` em `use-whatsapp-chat.ts` (alinhado com padrão v3.10.43)
- **Fix secundário (mismatch GET/POST):** rotas GET `/api/clientes/[id]/whatsapp` e `/api/socios/[id]/whatsapp` usavam `conversas.at(-1)` (mais recente por `criadaEm`) mas POST usa `findFirst({ orderBy: atualizadaEm })` — badge podia reportar estado errado se havia múltiplas conversas. Ambas corrigidas para `reduce()` por `atualizadaEm`
- **Varredura completa do padrão em todo src/:** encontrados e corrigidos 3 outros locais:
  - `portal-conversa-panel.tsx` — `carregar()` → `finally`
  - `notas-fiscais-tab.tsx` — `fetchNotas(true)` → `finally` em emitir/cancelar/reemitir
- `known_issues_patterns.md` atualizado com padrão consolidado e mismatch GET/POST
- tsc: sem erros

**Decisões tomadas:**
- Qualquer refresh de UI após envio SEMPRE no `finally`, nunca só no `try`
- GET de WhatsApp routes deve usar `atualizadaEm` (não `criadaEm`) para determinar `conversaAtual`, para manter consistência com POST

**Próximo passo natural:**
- Fazer tag `v3.10.45` e deploy

---

## 2026-04-12 — Fix renderização de arquivos no chat portal (v3.10.44)

**O que foi feito:**
- Diagnosticado bug duplo: arquivos enviados pelo operador não apareciam no painel `/atendimentos` nem no chat do portal do cliente
- **Causa 1 (PortalConversaPanel):** tipo `Mensagem` não tinha campos de mídia; rendering era apenas `<p>{m.conteudo}</p>` — balão ficava em branco
- **Causa 2 (portal-clara SSE):** condição `if (data.role && data.conteudo)` descartava mensagens com `conteudo = ''` (arquivo sem legenda)
- **Causa 3 (portal-clara GET):** `GET /api/portal/chat` não selecionava `mediaUrl`, `mediaType`, `mediaFileName`
- **Causa 4 (emit SSE):** `emitConversaMensagem` não propagava `mediaFileName` e `mediaType`
- Fixes aplicados em 4 arquivos: `portal-conversa-panel.tsx`, `portal-clara.tsx`, `portal/chat/route.ts`, `conversas/[id]/mensagem/route.ts`
- tsc + build: sem erros

**Decisões tomadas:**
- `Msg` e `Mensagem` nos chats de portal precisam sempre ter `mediaUrl`, `mediaType`, `mediaFileName`
- Condições SSE nunca devem testar `data.conteudo` como boolean — arquivo pode ter `conteudo = ''`

**Próximo passo natural:**
- Fazer tag `v3.10.44` e deploy

---

## 2026-04-12 — Fix histórico arquivos /atendimentos + texto após arquivos (v3.10.43)

**O que foi feito:**
- Diagnosticado bug: `TypeError: Failed to fetch` no Sentry + arquivos não aparecendo no histórico do /atendimentos
- Causa raiz: `router.refresh()` no `try` de `conversa-rodape.tsx` — quando `sendMedia` sofre timeout, catch é chamado e refresh nunca executa
- Fix 1: `router.refresh()` movido para `finally` em `conversa-rodape.tsx`
- Fix 2: `Sentry.captureException` adicionado ao catch de upload (estava faltando)
- Fix 3 (apontado pelo Alisson): texto + arquivos — texto agora enviado como mensagem separada após os arquivos, em vez de legenda do 1º arquivo (corrigido em `conversa-rodape.tsx` e `use-whatsapp-chat.ts`)
- AGENTS.md commitado com regras de postura, idioma e protocolo pré-implementação
- `docs/WHATSAPP.md` atualizado: limitação documentada + `conversa-rodape.tsx` na árvore de referência
- Deploy: tag `v3.10.43` + push

**Decisões tomadas:**
- Padrão: ações de "atualizar UI após envio" sempre no `finally`, nunca no `try`

**Próximo passo natural:**
- Verificar em produção se o histórico passa a aparecer corretamente após o deploy

