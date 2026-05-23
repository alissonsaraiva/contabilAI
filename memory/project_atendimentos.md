---
name: Fluxo de Atendimento Humano
description: Arquitetura completa do módulo de atendimentos — assumir/devolver IA, conversa detail, WhatsApp drawer, escalações, áudio proxy, anexos de mídia, segurança
type: project
---

## Campos-chave no banco

**ConversaIA:**
- `pausadaEm DateTime?` — quando preenchido, IA para de responder; humano está no controle

**MensagemIA:**
- `whatsappMsgData Json?` — payload `{ key, message }` do webhook para re-fetch de áudio na Evolution
- `mediaUrl String?` — URL pública do arquivo (S3)
- `mediaType String?` — `'image' | 'document' | 'audio'`
- `mediaFileName String?` — nome original do arquivo
- `mediaMimeType String?` — MIME type

**Escalacao:**
- `conversaIAId String?` — referência à conversa para link direto no CRM

## Fluxo de assumir/devolver

1. **Assumir** → POST `/api/conversas/pausar` → seta `pausadaEm = now()`
2. **Devolver para IA** → POST `/api/conversas/[id]/retomar` → seta `pausadaEm = null`
3. Histórico completo (incluindo msgs do operador) está disponível para a IA ao retomar
4. Mensagens `[áudio]` (não transcritas) entram no histórico — IA vê o marcador mas não o conteúdo

## Tela `/crm/atendimentos`

- **Cards "Conversas ativas"**: todas últimas 24h, incluindo pausadas (nunca some)
- Badge "Você no controle" quando pausada
- `AssumiirBtn` só aparece se não pausada — chama `/api/conversas/pausar` e redireciona para `/conversa/[id]`

## Tela `/crm/atendimentos/conversa/[id]`

- Histórico de mensagens com `<audio>` player para msgs `[áudio]`
- Renderização de mídia: imagens inline, documentos como link com ícone de download
- `ConversaRodape`: botão "Assumir controle" → textarea + botão de anexo + "Devolver para IA" (azul)
- Envio de mensagem → POST `/api/conversas/[id]/mensagem` → salva como `role: assistant`, envia via Evolution (WhatsApp) ou marca escalação resolvida (onboarding)
- Props `entidadeTipo` e `entidadeId` passadas do server component para habilitar upload de arquivo

## WhatsApp Chat Drawer (clientes/leads/sócios) — refatorado v3.10.23

**Rotas:**
- GET/POST `/api/clientes/[id]/whatsapp`
- GET/POST `/api/leads/[id]/whatsapp`
- GET/POST `/api/socios/[id]/whatsapp`
- GET (SSE) `/api/stream/conversas/[id]` — stream de novas mensagens (admin/contador)

**Componentes (refatorados de 663 → 120 linhas):**
- `whatsapp-chat-panel.tsx` — orquestrador (valida apiPath, renderiza boundary + inner)
- `use-whatsapp-chat.ts` — hook com todo o estado: mensagens, SSE, polling, upload, envio
- `chat-header.tsx` — badges IA/Humano, botões assumir/devolver
- `message-item.tsx` — renderiza cada mensagem (7 tipos de mídia)
- `chat-input.tsx` — textarea + anexo + folder picker + toggle IA + enviar
- `chat-boundary.tsx` — React Error Boundary

**Segurança dos POSTs (v3.10.23):**
- Rate limit: 30 msgs / 60 s por `userId` (`checkRateLimit` em `src/lib/whatsapp-utils.ts`)
- `mediaUrl` validada contra hostname de `STORAGE_PUBLIC_URL` (`isMediaUrlTrusted`)
- `mediaMimeType` **obrigatório** quando `mediaUrl` presente — validado contra `WHATSAPP_ALLOWED_MIME`
- `buildRemoteJid` rejeita números com < 8 ou > 13 dígitos
- SSE valida `clienteId | leadId | socioId` vinculado; orphan conversations → 403
- Try/catch com `Sentry.captureException` cobrindo todo o fluxo de envio

**SSE + polling:**
- SSE com reconexão exponencial (máx 5 tentativas, backoff até 30 s)
- `sseHealthyRef` — polling de 8 s só dispara quando `sseHealthyRef.current === false`
- `isMounted` flag previne criação de EventSource após desmontagem (fix de race condition)

**Utilitários compartilhados:** `src/lib/whatsapp-utils.ts`
- `buildRemoteJid`, `getEvolutionConfig`, `isMediaUrlTrusted`, `checkRateLimit`, `WHATSAPP_ALLOWED_MIME`

**`naoModoIA`:** quando `true`, mensagem é enviada sem pausar IA ("modo comunicado"). Reset automático em `reativarIA()`.

## Envio de arquivos (mídia)

**Fluxo:**
1. Operador clica no clipe → input file abre
2. Browser faz POST `/api/upload` com `{ tipo, entidadeId, entidadeTipo, contentType }` → recebe `{ uploadUrl, publicUrl }`
3. Browser faz PUT direto no S3 com o arquivo
4. `publicUrl` é enviada junto com a mensagem
5. Backend valida hostname da URL e MIME type antes de chamar `sendMedia()`

**Tipos aceitos:** `image/*`, PDF, Word, Excel, CSV, texto (whitelist em `WHATSAPP_ALLOWED_MIME`)

**Renderização no chat:**
- `mediaType === 'image'` → `<img>` inline
- `mediaType === 'document'` → link com ícone + botão de download
- `conteudo === '[áudio]'` → `<audio controls>` com proxy `/api/whatsapp/media/[id]`
- Mensagem excluída → placeholder cinza "`Mensagem apagada`"
- Status `'pending'` → bolha azul-claro com badge "Enviando..."
- Status `'failed'` → bolha vermelha

## Escalações

- Criadas automaticamente quando: IA falha, áudio não transcrito, ##HUMANO## detectado, entrega WhatsApp falha
- Status: `pendente` → `em_atendimento` → `resolvida`
- `conversaIAId` permite link direto da notificação para a conversa
