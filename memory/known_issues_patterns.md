---
name: Catálogo de Padrões de Erro Conhecidos
description: Erros reais que já aconteceram em produção/dev, suas causas raiz e onde procurar — consultar ao diagnosticar bugs
type: project
---

# Padrões de Erro Conhecidos

> Quando um bug aparecer, verificar primeiro se encaixa em algum padrão abaixo antes de investigar do zero.

---

## Build / Deploy

### Build quebra no CI
**Sintoma:** Deploy falha, TypeScript errors em produção que não apareciam local
**Causa raiz:** Falta de `npx tsc --noEmit` + `npm run build` antes do commit
**Onde olhar:** Erros de tipo TS, imports inexistentes, props erradas
**Prevenção:** Checklist pré-entrega no AGENTS.md

### Deploy não dispara
**Sintoma:** Push para main mas nada acontece no CI
**Causa raiz:** CI só dispara com tag `v*` (ex: `git tag v3.10.43 && git push origin v3.10.43`)
**Onde olhar:** `.github/workflows/`

### Migrations falham em produção (P2022)
**Sintoma:** Erro Prisma P2022, coluna não existe, tabela não encontrada
**Causa raiz:** Alguém usou `prisma db push` ao invés de `prisma migrate dev`
**Onde olhar:** `prisma/migrations/` — verificar se o SQL da alteração existe
**Prevenção:** NUNCA usar `db push`

---

## WhatsApp

### IA não responde mensagens
**Sintoma:** Cliente manda mensagem no WhatsApp e não recebe resposta
**Causas possíveis:**
1. **Lock travado** — `processandoEm` setado mas instância caiu mid-processing (sem timeout)
2. **Evolution API fora** — container parou na VPS
3. **Webhook não chega** — verificar logs da Evolution API
**Onde olhar:** Tabela `ConversaIA` (campo `processandoEm`), logs do container `evolution-api`

### Mídia não carrega
**Sintoma:** Áudio/imagem/documento do WhatsApp aparece como erro no CRM
**Causa raiz:** MIME type não inferido corretamente (fix v3.10.42: inferir por extensão)
**Onde olhar:** `src/lib/whatsapp/arquivar-midia.ts`

### Mensagem enviada pelo CRM aparece na sidebar mas não no painel de chat
**Sintoma:** Operador envia mensagem no painel de Atendimentos. Texto aparece na barra lateral (preview da conversa) mas não no histórico do chat. Bug reiterativo durante meses.

**Causa raiz definitiva (v3.10.50):** O GET consolidava mensagens de múltiplas conversas com `flatMap` sem sort global. A ordem seguia `conversaIA.criadaEm` (data de criação da conversa). Uma conversa criada mais cedo (ex: 02/04) podia ter mensagens até hoje; outra criada depois (05/04) tinha mensagens só até 05/04. Flatmap: `[...msgs-02/04...msgs-hoje...msgs-05/04]`. O painel auto-scrolla para o "fundo" = última posição do array = mensagens de 8 dias atrás. As mensagens recentes ficavam no meio, fora do viewport. A sidebar mostrava correto porque vai diretamente à conversa com maior `atualizadaEm` e pega a última mensagem dela.
**Fix (v3.10.50):**
```ts
conversas.flatMap(c => c.mensagens)
  .sort((a, b) => new Date(a.criadaEm).getTime() - new Date(b.criadaEm).getTime())
```
Aplicado em `clientes/[id]/whatsapp`, `socios/[id]/whatsapp`, `leads/[id]/whatsapp`.
**Padrão geral:** Qualquer flatMap de mensagens de múltiplas conversas DEVE ter sort global por `criadaEm`. Nunca assumir que a ordem de conversas por `criadaEm` produz mensagens em ordem cronológica — conversas antigas podem ter mensagens mais recentes que conversas novas.

**Fixes auxiliares válidos (v3.10.48/49):**
- `emitWhatsAppRefresh(conversa.id)` após `mensagemIA.create()` em clientes/socios routes — garante SSE mesmo quando browser perde conexão POST
- `carregarVersionRef` — descarta respostas stale de `carregar()` concorrentes
- `sseHealthyRef` no polling do Portal — evita SSE+polling simultâneos
- `cache: 'no-store'` no fetch de `carregar()` — previne cache HTTP do browser
- `conversa-rodape.tsx`, `use-whatsapp-chat.ts`, `portal-conversa-panel.tsx` — `carregar()` no `finally` (v3.10.43–45)

**Como diagnosticar na VPS se o bug voltar:**
```bash
# Ver conversas do cliente suspeito — múltiplas conversas = candidato ao bug
ssh deploy@82.25.79.193 "docker exec postgresql-4cnu-postgresql-1 psql -U <POSTGRES_USER> contabil_ia -c 'SELECT id, LEFT(\"remoteJid\",25) as jid, \"criadaEm\", \"atualizadaEm\", (SELECT COUNT(*) FROM mensagens_ia WHERE \"conversaId\"=c.id) as msgs FROM conversas_ia c WHERE \"clienteId\"='"'"'UUID'"'"' ORDER BY \"criadaEm\" ASC;'"
# Se uma conversa com criadaEm mais antigo tiver msgs mais recentes que outra com criadaEm mais novo → ordering bug
```

### Apagar mensagem para todos não funciona
**Sintoma:** Operador clica "apagar para todos" no CRM. UI remove a mensagem localmente (soft delete ok) mas ela permanece no WhatsApp do cliente.
**Causa raiz 1 (v3.10.57):** Endpoint chamado como `DELETE /chat/message/{instance}` — URL errada, retornava 404 silencioso.
**Causa raiz 2 (v3.10.57):** Rotas POST de envio pelo CRM não persistiam `whatsappMsgData` na `MensagemIA`.
**Causa raiz 3 (v3.10.63):** `deleteMessage` usava `conversa.remoteJid` ao invés de `waKey.remoteJid`. Números brasileiros podem ter formato diferente: a conversa armazena `5585981186338@s.whatsapp.net` (com o 9) mas a Evolution API retorna a key com `558581186338@s.whatsapp.net` (sem o 9). O REVOKE com JID errado é ignorado silenciosamente pelo WhatsApp — API retorna 201 sucesso mas nada é apagado.
**Fix v3.10.63:** `deleteMessage` agora usa `waKey.remoteJid` (JID original da key da mensagem) com fallback para `conversa.remoteJid`.
**Padrão geral:**
1. Qualquer operação de exclusão de mensagem WhatsApp depende de `whatsappMsgData`. Toda rota que envia mensagens deve persistir esse campo.
2. **Nunca assumir que `conversa.remoteJid` e `waKey.remoteJid` são iguais.** Números brasileiros têm formatos inconsistentes (8 vs 9 dígitos). Sempre preferir o JID da key para operações que referenciam uma mensagem específica.

### Mensagens enviadas para número errado (campo telefone vs whatsapp)
**Sintoma:** Mensagem WhatsApp chega no número de telefone fixo do cliente (ou número diferente do WhatsApp cadastrado).
**Causa raiz:** Código usava `cliente.telefone || cliente.whatsapp` — o `telefone` pode ser um fixo ou número diferente do WhatsApp real.
**Fix (v3.10.59):** Removido o fallback para `telefone` em 16 rotas/componentes. Envio usa exclusivamente `whatsapp`.
**Padrão geral:** NUNCA usar `telefone` como fallback para envio de WhatsApp. Se `whatsapp` estiver vazio, a operação deve falhar ou mostrar erro — não enviar para `telefone`. Para sócios sem `whatsapp`, buscar `cliente.whatsapp` via CPF.

### Mensagens/arquivos chegam no WhatsApp mas não aparecem no histórico do CRM (padrão antigo)
**Sintoma:** `TypeError: Failed to fetch` no Sentry. Mensagem chega ao destinatário mas painel não atualiza.
**Causa raiz:** `carregar()`/`router.refresh()` estava só no `try`, nunca no `finally`.
**Fixes:** `finally` em `conversa-rodape.tsx` (v3.10.43), `use-whatsapp-chat.ts` e `portal-conversa-panel.tsx` (v3.10.45).
**Padrão geral:** Qualquer "atualizar UI após envio" DEVE ficar no `finally`.

---

## Upload de Arquivos

### TypeError: Failed to fetch (*.r2.cloudflarestorage.com)
**Sintoma:** Operador tenta anexar imagem/arquivo em qualquer chat (WhatsApp, Portal, Escalação). Erro no Sentry: `TypeError: Failed to fetch (4cfb1c818af7e115e9d9ad185706bc13.r2.cloudflarestorage.com)`, tags `module=whatsapp-chat, operation=upload`.
**Causa raiz:** O upload usava URL presignada (o browser fazia `PUT` direto ao R2). O bucket R2 não tinha CORS configurado para aceitar requisições cross-origin do browser. O preflight OPTIONS falha silenciosamente e o PUT é bloqueado.
**Fix (v3.10.51):** `/api/upload` mudado para aceitar `multipart/form-data` e fazer upload server-side com `uploadArquivo()`. O browser agora manda o arquivo ao Next.js (mesma origem), que repassa ao R2. Todos os 5 callers foram atualizados.
**Padrão geral:** Nunca usar URL presignada R2 para upload direto do browser sem antes configurar CORS no bucket. Se precisar de upload direto (eficiência em arquivos grandes), configurar CORS via Cloudflare Dashboard → R2 → Bucket → Settings → CORS Policy com `AllowedOrigins: ['https://*.avos.digital']`, `AllowedMethods: ['PUT']`, `AllowedHeaders: ['Content-Type']`.

---

## Portal

### Arquivos enviados não aparecem no chat portal (CRM e cliente)
**Sintoma:** Operador envia arquivo no `PortalConversaPanel` — balão aparece em branco ou nem aparece. No portal do cliente, arquivo também não renderiza.
**Causa raiz (múltipla):**
1. Tipo `Mensagem`/`Msg` não incluía campos de mídia (`mediaUrl`, `mediaType`, `mediaFileName`)
2. Rendering só fazia `<p>{m.conteudo}</p>` — sem tratamento de arquivos
3. Condição SSE `if (data.role && data.conteudo)` descartava silenciosamente mensagens com `conteudo = ''` (arquivo sem legenda)
4. `GET /api/portal/chat` não selecionava campos de mídia
5. `emitConversaMensagem` não propagava `mediaFileName` e `mediaType`
**Fix aplicado:** v3.10.44 — 4 arquivos corrigidos
**Padrão geral:** Condições SSE nunca devem testar `conteudo` como boolean. Tipos de mensagem em chats sempre precisam incluir campos de mídia.

### Troca de empresa ativa não atualiza o portal (RESOLVIDO v3.10.49)
**Sintoma:** Usuário seleciona outra empresa no `EmpresaSelector` — dropdown atualiza mas todo o conteúdo da página (CardInfoCliente "Minha empresa", regime, obrigações, documentos, chamados) continua mostrando dados da empresa anterior.
**Causa raiz:** `POST /api/portal/empresa/trocar` setava o cookie JWT **sem `domain`**. Em produção, o cookie de sessão original (criado pelo NextAuth no login) usa `domain=.avos.digital`. Sem domínio explícito, o `trocar` cria um segundo cookie com `domain=portal.avos.digital`. O browser envia os dois no header `Cookie`; RFC 6265 ordena por tempo de criação (mais antigo primeiro) quando `path` é igual. NextAuth lê o primeiro → JWT antigo → `empresaId` estático → nada atualiza. Em desenvolvimento (`localhost`) o `domain` é `undefined` nos dois casos, os cookies são idênticos e o novo substitui o antigo — por isso o bug só aparecia em produção.
**Fix aplicado:** v3.10.49 — `trocar/route.ts` agora passa `domain: IS_PROD ? '.avos.digital' : undefined` ao setar o cookie, alinhado com `auth-portal.ts`.
**Onde olhar:** `src/app/api/portal/empresa/trocar/route.ts` — se este padrão aparecer em qualquer outra rota que emite JWT manualmente, aplicar o mesmo fix.
**Padrão geral:** Qualquer rota que re-emite um cookie de sessão manualmente (via `encode()` + `res.cookies.set()`) deve replicar exatamente as opções de `domain`, `path`, `secure` e `sameSite` do cookie original. Diferenças silenciosamente criam cookies duplicados.

### Login portal loop infinito
**Sintoma:** Cliente clica no magic link mas volta pra tela de login
**Causas possíveis:**
1. **Cookie não setado** — proxy não consumia token quando sessão já existia (fix v3.10.41)
2. **Empresa sem match** — cliente sem empresa vinculada
**Onde olhar:** `src/proxy.ts`, cookie `portal.session-token`

### Logout não funciona
**Sintoma:** Cliente clica logout mas continua logado
**Causa raiz:** Cookie não era limpo corretamente (fix v3.10.42: limpar diretamente)
**Onde olhar:** Rota de logout do portal, headers Set-Cookie

---

## WhatsApp / CRM — GET vs POST mismatch de conversaAtual

### Badge "IA ativa" persiste após operador enviar (mismatch de conversa)
**Sintoma:** Após operador enviar mensagem no WhatsApp chat panel, badge continua "IA ativa" em vez de "Você no controle".
**Causa raiz:** GET (`/api/clientes/[id]/whatsapp`, `/api/socios/[id]/whatsapp`) usava `conversas.at(-1)` (conversa mais recentemente **criada**) para determinar `pausada`. POST usa `findFirst({ orderBy: atualizadaEm: 'desc' })` (mais recentemente **atualizada**). Se há múltiplas conversas, o POST pausa conversa A mas o GET reporta estado da conversa B — badge fica errado.
**Fix aplicado:** v3.10.45 — ambas as rotas GET agora usam `reduce()` por `atualizadaEm` para `conversaAtual`, alinhado com POST.
**Onde olhar:** `src/app/api/clientes/[id]/whatsapp/route.ts`, `src/app/api/socios/[id]/whatsapp/route.ts`

---

## CRM

### Busca não encontra acentos
**Sintoma:** Buscar "Jose" não encontra "José"
**Causa raiz:** Queries SQL sem `unaccent()` ou comparação accent-insensitive
**Fix:** v3.10.39 adicionou busca accent-insensitive em todo CRM + IAs + APIs
**Onde olhar:** Se aparecer de novo, verificar se a query usa `unaccent()` ou collation adequada

---

## IA / Agente

### Tool não encontrada pelo agente
**Sintoma:** IA diz que não pode executar uma ação que deveria conseguir
**Causas possíveis:**
1. Tool desabilitada no `toolsDesabilitadas` do escritório
2. Tool não registrada para o canal correto (whatsapp/crm/portal)
3. Typo no nome da tool (ex: `atudalizarDadosCliente` vs `atualizarDadosCliente`)
**Onde olhar:** `src/lib/ai/tools/`, registry de tools, config do escritório

---

## Infra / VPS

### Disco cheio
**Sintoma:** Aplicação trava, logs param, banco não aceita escrita
**Estado conhecido:** 14 GB disponível (auditado 2026-04-03), monitorar crescimento
**Onde olhar:** `df -h` na VPS, limpar Docker images antigas: `docker image prune -a`

### Cron não executa
**Sintoma:** Agendamentos, lembretes ou verificações não rodam
**Causa raiz:** Crontab da VPS não foi configurado para o novo endpoint
**Onde olhar:** `crontab -l` no usuário `deploy` da VPS (`82.25.79.193`)

---

## Observabilidade / Logs

### Catch vazios silenciando erros em produção (RESOLVIDO v3.10.46)
**Sintoma:** Operações falhavam silenciosamente — RAG com dados órfãos, PIX expirado retornado ao cliente, comunicados WhatsApp não enviados sem erro visível, embeddings não deletados
**Causa raiz:** ~75 catch blocks com `.catch(() => {})`, `.catch(() => null)` ou `} catch {` sem variável — erros descartados sem nenhum log
**Áreas mais críticas:**
1. RAG: `deleteEmbeddings()` e `deleteBySourceId()` em DELETE de clientes, leads, documentos, relatórios
2. PIX: `refresharPixCobranca()` retornava QR code expirado ao cliente
3. AI tools: transferir-cliente, aprovar-documento, enviar-comunicado-segmentado perdiam erros
4. Cron: expiração de leads e envio de email admin falhavam silenciosamente
5. Webhooks: clicksign, zapsign, asaas não logavam erros de parse/vínculo
**Fix aplicado:** v3.10.46 — 59 arquivos, todos catch blocks agora logam com `console.error('[módulo] falha:', err)` + Sentry onde já importado
**Exceções aceitas (catch vazio OK):** `JSON.parse()` defensivo, `localStorage` SSR, `controller.enqueue/close` em streams SSE, `req.json().catch(() => null)`

---

## How to apply
Ao diagnosticar qualquer bug, percorrer esta lista primeiro. Se o bug for novo e significativo, adicionar aqui após resolver com causa raiz + solução.
