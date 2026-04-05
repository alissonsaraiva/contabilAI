# SAUDE — Diagnóstico do Sistema

> **Sistema:** AVOS v3.10.23 | **Fonte:** `SISTEMA.md` (extraído)

---

## Limitações Conhecidas

| # | Limitação | Impacto |
|---|-----------|---------|
| 1 | `src/middleware.ts` descontinuado — coexiste com `src/proxy.ts`, causa build error se ativado | Alto |
| 2 | Sem retry automático para Spedy webhooks — NFS-e fica em `enviando`; mitigado pelo cron de reconciliação (1h) | Médio |
| 3 | Lock de WhatsApp (`processandoEm`) não tem timeout — se a instância cair mid-processing, conversa fica bloqueada indefinidamente | Médio |
| 4 | Sem health check para Evolution API — instância desconectada não é detectada proativamente | Médio |
| 5 | DocuSeal self-hosted (`82.25.79.193:32825`) — single point of failure na VPS | Médio |
| 6 | URLs de mídia Evolution API — dependem de campo `media` que pode variar por versão da API | Baixo |
| 7 | Sem paginação em alguns endpoints de listagem — risco de timeout com volumes grandes | Médio |
| 8 | Embeddings sem fallback — se Voyage AI cair e não há Anthropic configurado, RAG para | Alto |
| 9 | Sem rate limiting no endpoint `/api/agente/crm` — agente pode ser chamado em loop | Médio |
| 10 | `atudalizarDadosCliente` — typo persistente no nome da tool | Baixo |

## Fluxos Frágeis

| Fluxo | Risco | Motivo |
|-------|-------|--------|
| WhatsApp webhook | Alto | Sem validação de autenticidade do payload |
| Processamento de NFS-e | Médio | Webhook assíncrono sem retry; cron de reconciliação (1h) é o fallback — monitorado via healthchecks.io |
| Sincronização de email | Baixo | Cron manual na VPS — monitorado via healthchecks.io |
| Conversão Lead→Cliente | Médio | 3 pontos de conversão distintos (leads/assinado, contrato/webhook, manual) — podem criar duplicatas; idempotência reforçada (v3.10.15) |
| Magic links do portal | Médio | Token hash SHA-256, mas sem rate limit no `/api/portal/magic-link` |
| Lead assinado sem dados | Baixo | Webhook marca como assinado mas não cria cliente; requer intervenção manual; alerta Sentry configurado (v3.10.15) |

## Testes Automatizados

- ❌ Nenhum teste automatizado identificado no codebase (sem `*.test.ts`, `*.spec.ts`, `jest.config`, `vitest.config`)
- ⚠️ Sistema está em produção sem cobertura de testes automatizados

### Lacunas críticas de teste:
- Webhooks externos (Asaas, Spedy, Zapsign, Clicksign)
- Pipeline de WhatsApp (recebimento → processamento → resposta)
- Sistema de email (IMAP sync, threading, envio)
- Agente operacional (tool calling, idempotência)
- Fluxo de onboarding (etapas, validações)
- Sistema de pagamento (provisioning Asaas)
- Emissão de NFS-e (Spedy)

## Áreas com Pouco Log/Rastreamento

- Pipeline de WhatsApp: processamento de mídia falha silenciosamente em alguns casos
- Ingestão RAG: falhas de embedding podem não ser propagadas
- Envio de comunicados: `ComunicadoEnvio` rastreia, mas sem retry

## Código Complexo (alto risco de bugs)

- `src/lib/ai/agent.ts` — loop de tool calling com permissões por canal
- `src/lib/whatsapp/pipeline/` — múltiplas etapas assíncronas
- `src/lib/email/com-historico.ts` — threading de emails é não trivial
- `src/proxy.ts` — roteamento por subdomínio em Next.js 16 é frágil por design

## Inconsistências Encontradas

1. **Nome do projeto**: `package.json` ainda tem versão `0.1.0` e nome interno inconsistente com AVOS
2. **`src/middleware.ts`**: arquivo existe mas está descontinuado — deveria ser removido
3. **Tool `atudalizarDadosCliente`**: typo persistente no nome da tool (deveria ser `atualizarDadosCliente`)
4. **Documentação `docs/ia-arquitetura.md`**: provavelmente desatualizada
5. **Variáveis `ZAPI_*` no .env.example**: código atual usa `EVOLUTION_*` (Z-API era a integração anterior)
6. **`VAPIR_PRIVATE_KEY`** no .env.example: typo (deveria ser `VAPID_PRIVATE_KEY`)
7. **Endpoint `/api/escalacoes/pendentes-count`**: marcado como legacy mas ainda existe
8. **Schema `Escalacao`**: campo `canal` usa `CanalEscalacao` mas `conversaIAId` é opcional — não força consistência

## Lacunas Documentadas (Features Sem Docs)

> Atualizado após revisão geral completa do código em 2026-04-04.

### ✅ Documentadas na revisão 1 (2026-04-04)
1. `src/lib/notificacoes.ts` → [DOCUMENTOS.md](./DOCUMENTOS.md)
2. `src/lib/historico.ts` → [DOCUMENTOS.md](./DOCUMENTOS.md)
3. `src/lib/ai/conversa.ts` → [IA.md](./IA.md)
4. `src/lib/ai/health-cache.ts` → [IA.md](./IA.md)
5. `/api/conhecimento`, `/api/rag/**` → [IA.md](./IA.md)
6. `src/lib/services/documentos.ts` → [DOCUMENTOS.md](./DOCUMENTOS.md)
7. `src/lib/services/chamados.ts` (resolverOS) → [CHAMADOS.md](./CHAMADOS.md)
8. `src/lib/pdf/` → [DOCUMENTOS.md](./DOCUMENTOS.md)
9. `src/lib/whatsapp/arkivar-midia.ts`, `identificar-contato.ts`, `constants.ts` → [WHATSAPP.md](../WHATSAPP.md)

### ✅ Documentadas na revisão 2 — Infraestrutura (2026-04-04)
10. `src/lib/rate-limit.ts` → [INFRA.md](./INFRA.md)
11. `src/lib/crypto.ts` → [INFRA.md](./INFRA.md)
12. `src/lib/storage.ts` + `storageKeys` → [INFRA.md](./INFRA.md)
13. `src/lib/xml-parser.ts` → [INFRA.md](./INFRA.md)
14. `src/lib/evolution.ts` (circuit breaker, retry, 12 funções) → [INFRA.md](./INFRA.md)
15. `src/lib/clicksign.ts` (fluxo 3 passos, retry) → [INFRA.md](./INFRA.md)
16. `src/lib/spedy.ts` (SpedyClient, 485 linhas) → [INFRA.md](./INFRA.md)
17. `src/lib/whatsapp/media.ts` (download direto CDN, HKDF-SHA256) → [INFRA.md](./INFRA.md)
18. `src/lib/whatsapp/human-like.ts` → [INFRA.md](./INFRA.md)
19. `src/lib/whatsapp/action-router.ts` → [INFRA.md](./INFRA.md)
20. `src/lib/whatsapp/boas-vindas.ts` → [INFRA.md](./INFRA.md)
21. `src/lib/services/classificar-documento.ts` → [INFRA.md](./INFRA.md)
22. `src/lib/services/extrair-conteudo-documento.ts` → [INFRA.md](./INFRA.md)
23. `src/lib/ai/transcribe.ts` → [INFRA.md](./INFRA.md)
24. `src/lib/historico-config.ts` (EVENTO_CONFIG, 21 tipos) → [INFRA.md](./INFRA.md)

### ✅ Documentadas na revisão 2 — Rotas (2026-04-04)
25. `GET /api/dashboard` → [ROTAS.md](./ROTAS.md)
26. `GET /api/cnpj/[cnpj]` → [ROTAS.md](./ROTAS.md)
27. `POST /api/upload` → [ROTAS.md](./ROTAS.md)
28. `GET /api/crm/contatos` → [ROTAS.md](./ROTAS.md)
29. `POST /api/crm/inadimplentes/mensagem` → [ROTAS.md](./ROTAS.md)
30. `GET /api/portal/session` → [ROTAS.md](./ROTAS.md)
31. `GET /api/portal/verificar` → [ROTAS.md](./ROTAS.md)
32. `POST /api/portal/escalacao` → [ROTAS.md](./ROTAS.md)
33. Hooks React: `useAutoSave`, `useBadges`, `useCep`, `useCnpj`, `useMobile` → [ROTAS.md](./ROTAS.md)

### ✅ Documentadas na revisão 3 — IA completa (2026-04-04)
34. `src/lib/ai/providers/types.ts` (AIRequest, AIResponse, ToolCall, ToolResult) → [IA.md](./IA.md)
35. `src/lib/ai/providers/index.ts` (getProvider) → [IA.md](./IA.md)
36. `src/lib/ai/providers/fallback.ts` (circuit breaker 2min, ordem fallback, notificação) → [IA.md](./IA.md)
37. `src/lib/ai/providers/claude.ts`, `openai.ts`, `google.ts` (adaptadores) → [IA.md](./IA.md)
38. `src/lib/ai/tools/registry.ts` (registrarTool, getCapacidadesPorCanal) → [IA.md](./IA.md)
39. `src/lib/ai/tools/types.ts` (Tool, ToolContext, ToolMeta, ToolExecuteResult) → [IA.md](./IA.md)
40. `src/lib/ai/tools/index.ts` (64 imports, como adicionar nova tool) → [IA.md](./IA.md)
41. `src/lib/ai/ask.ts` completo (7 passos, guardrails, marcadores, thresholds RAG) → [IA.md](./IA.md)
42. Catálogo das 64 tools com label, canais e descrição → [IA.md](./IA.md)
43. `src/lib/schemas/lead-dados-json.ts` (dadosJson, parseDadosJson, getNomeFromDadosJson) → [IA.md](./IA.md)

### ⚠️ Intencionalmente não documentadas (baixo valor/alto custo de manutenção)
- **131 componentes React individuais (`src/components/`)** — documentados funcionalmente por módulo. Inventário exaustivo tem custo de manutenção maior que o benefício.
- **55 pages `.tsx` do CRM e Portal** — cobertas pelos docs funcionais de cada feature.
- **Providers IA internos (`claude.ts`, `openai.ts`, `google.ts`)** — implementações de adaptação de API. Mudam conforme os providers evoluem — manter sincronizado seria custoso. A interface `AIProvider` e o comportamento de fallback estão documentados.




## Sugestões de Melhoria

### Segurança
1. **Adicionar HMAC/auth no webhook WhatsApp** — qualquer um pode POSTar para `/api/whatsapp/webhook`
2. **Rate limit no magic link** — `api/portal/magic-link` sem proteção contra enumeração
3. ✅ Rate limit no agente — implementado: 60 req/userId/hora em `/api/agente/crm`
4. ✅ Migrar ZapSign para header — `X-ZapSign-Secret` é o único mecanismo (v3.10.15)
5. ✅ Rate limit + validação de mídia nas rotas de envio WhatsApp — implementado (v3.10.23)

### Confiabilidade
1. ✅ Timeout no lock de WhatsApp — `LOCK_TIMEOUT = 30s` em `processar-pendentes.ts`
2. ✅ Retry para webhooks Spedy — cron de reconciliação cobre ambos os casos
3. **Health check Evolution API** — detectar instância desconectada proativamente

### Observabilidade
1. **Adicionar testes automatizados** — ao menos para os webhooks críticos
2. ✅ Monitorar cron jobs — Sentry Cron Monitoring implementado em todos os crons
3. **Métricas de RAG** — taxa de hit, latência de busca

### Code Quality
1. **Corrigir typo `atudalizarDadosCliente`** em todas as referências
2. **Remover `src/middleware.ts`** — causa confusão e pode causar bugs
3. **Atualizar `docs/ia-arquitetura.md`** — está desatualizado

### Onboarding (pendentes — v3.10.16+)
1. ✅ Verificação de e-mail por OTP — nova etapa `/onboarding/verificar-email` com OTP de 6 dígitos
2. ✅ Notificação de conversão por WhatsApp — `enviarBoasVindasWhatsApp()` após conversão ZapSign
3. **Prova de leitura do contrato** — exigir scroll até o fim antes de habilitar checkbox de aceite
4. **Histórico de tentativas de assinatura** — tabela `ContratoTentativa` para auditar falhas recorrentes
5. **Rollback automático de escalação** — timeout de 30min sem resposta deveria reativar IA

## Histórico de Bugs Corrigidos (v3.10.x)

| Versão | Bug | Correção |
|--------|-----|----------|
| v3.10.9 | Envio de arquivo pelo humano no chat WhatsApp falha | `conversas/[id]/mensagem`: gera URL assinada R2 antes de chamar `sendMedia` |
| v3.10.9 | Mensagens duplicadas no escalonamento WhatsApp | `enviar-resposta.ts`: removida duplicação do histórico |
| v3.10.9 | Links de documentos no chat do portal malformados | `buscar-documentos.ts`: usa `NEXT_PUBLIC_PORTAL_URL` para URL completa |
| v3.10.12 | IA do portal não conseguia enviar documentos ao cliente | `classificarIntencao` agora recebe `canal` |
| v3.10.12 | Badge IA/Humano no portal não revertia ao devolver para IA | Polling 8s lê `pausada` nos dois sentidos |
| v3.10.13 | `emissao_documento` exibido cru na tela de chamado | Adicionado ao mapa `TIPO_CHAMADO` |
| v3.10.13 | Refatoração: `OrdemServico` → `Chamado` | Modelo, rotas, componentes e service renomeados |
| v3.10.13 | Notas internas de chamado ausentes | Novo modelo `ChamadoNota` + migration |
| v3.10.14 | PDF/XML do portal buscavam sempre da Spedy (502 se offline) | R2-first → Spedy fallback |
| v3.10.15 | `GET /api/leads/:id` exigia autenticação — wizard público falha | Novo endpoint público `GET /api/onboarding/lead/:id` |
| v3.10.15 | Auto-save chamava endpoint autenticado — todos os saves falhavam com 401 | `useAutoSave` agora usa endpoint público com retry |
| v3.10.15 | Webhook ZapSign: race condition P2002 | Recuperação agora usa `$transaction` atômica |
| v3.10.21 | GET portal NFS-e excluía status `enviando`/`processando` | Status filter expandido |
| v3.10.21 | `parseFloat("3.000,00")` retornava `3` | `parseBRL()` implementado com strip de separadores |
| v3.10.22 | Badge de docs mostrava contagem só dos 6 exibidos | `count()` separado para total real |
| v3.10.23 | `whatsapp-chat-panel.tsx` sem separação de responsabilidades | Refatorado em 6 componentes + 1 hook |
| v3.10.23 | Race condition no SSE | Flag `isMounted` definida antes de `conectar()` |
| v3.10.23 | SSE + polling rodando em paralelo sempre | `sseHealthyRef` rastreia saúde do SSE |
| v3.10.23 | `buildRemoteJid` sem validação de dígitos | Extraído para `whatsapp-utils.ts`; rejeita <8 ou >13 dígitos |
