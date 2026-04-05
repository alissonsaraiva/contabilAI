# INFRAESTRUTURA — Libs e Utilitários Internos

> **Sistema:** AVOS v3.10.23 | **Revisado:** 2026-04-04 | **Escopo:** `src/lib/` — utilitários transversais

---

## Storage — Cloudflare R2 (`src/lib/storage.ts`)

Client S3-compatible para Cloudflare R2. Configurado via `STORAGE_*` vars.

### Funções exportadas

| Função | Descrição |
|--------|-----------|
| `uploadArquivo(key, buffer, contentType)` | Upload com timeout 15s, validação de tipo (bloqueia `.exe`, `.sh`) e limite de 100 MB. Retorna URL pública |
| `getUploadUrl(key, contentType)` | URL assinada de upload (PUT) — válida 5 min. Para uploads diretos do browser |
| `getDownloadUrl(key, expiresIn=300)` | URL assinada de download (GET). Usado para arquivos privados |
| `deletarArquivo(key)` | Remove arquivo do bucket |
| `storageKeys.*` | Factory de chaves padronizadas — ver abaixo |

### Chaves padronizadas (`storageKeys`)

```
leads/{leadId}/docs/{nome}              → documentoLead()
clientes/{clienteId}/docs/{nome}        → documentoCliente()
empresas/{empresaId}/docs/{nome}        → documentoEmpresa()
contratos/{leadId}/contrato.pdf         → contratoLead()
escritorio/logo                         → logoEscritorio()
escritorio/favicon                      → faviconEscritorio()
comunicados/{comunicadoId}/{nome}        → comunicadoAnexo()
notas-fiscais/{clienteId}/{notaId}/nota.pdf  → notaFiscalPdf()
notas-fiscais/{clienteId}/{notaId}/nota.xml  → notaFiscalXml()
```

> **R2 não é público por padrão** — usar `getDownloadUrl()` para URLs de download privadas, não `STORAGE_PUBLIC_URL` direto.

---

## Crypto — AES-256-GCM (`src/lib/crypto.ts`)

Criptografia simétrica para credentials salvas no banco (API keys, senhas de IMAP, etc.).

### Funções

| Função | Descrição |
|--------|-----------|
| `encrypt(plain)` | Encripta string com AES-256-GCM. Retorna `"iv:authTag:ciphertext"` em base64 |
| `decrypt(stored)` | Decripta o formato acima. Lança se formato inválido |
| `isEncrypted(val)` | Detecta se o valor está no formato encriptado (não precisa tentar `decrypt` para saber) |
| `maskKey(val)` | Exibe somente os últimos 4 caracteres: `••••••••••••3f2a` — seguro para UI |

**Variável necessária**: `ENCRYPTION_KEY` — 64 chars hex (256 bits). Gerar com `openssl rand -hex 32`.

**Formato armazenado**: `iv(16b64):authTag(24b64):ciphertext(b64)` — `isEncrypted()` valida comprimentos exatos.

> **Padrão**: sempre usar `isEncrypted(val) ? decrypt(val) : val` antes de usar qualquer credential do banco.

---

## Rate Limiter (`src/lib/rate-limit.ts`)

Rate limiter in-memory (por processo). Para deploy multi-instância com Redis, substituir o store.

### Funções

| Função | Assinatura | Descrição |
|--------|------------|-----------|
| `rateLimit` | `(key, limit, windowMs) → RateLimitResult` | Verifica + incrementa. Retorna `{allowed, remaining}` ou `{allowed:false, retryAfterMs}` |
| `getClientIp` | `(req) → string` | IP real considerando proxies: `cf-connecting-ip` > `x-real-ip` > `x-forwarded-for` |
| `tooManyRequests` | `(retryAfterMs?) → Response` | Resposta 429 padronizada com header `Retry-After` |

### Uso típico em route handler

```ts
const result = rateLimit(`magic-link:${email}`, 5, 60_000) // 5 req/min
if (!result.allowed) return tooManyRequests(result.retryAfterMs)
```

**Limpeza automática**: entries expiradas são removidas a cada 5 min via `setInterval` com `.unref()`.

---

## XML Parser (`src/lib/xml-parser.ts`)

Parser de documentos fiscais brasileiros usando `fast-xml-parser`.

### Tipos suportados

| Tipo | Detectado por |
|------|---------------|
| `NFe` | Tag `<NFe>` ou `<nfeProc>` (mod ≠ 65) |
| `NFC-e` | Tag `<NFe>` com `ide.mod == 65` |
| `CT-e` | Tag `<CTe>` ou `<cteProc>` |
| `NFS-e` | Tag `<CompNfse>` ou `<ListaNfse>` — padrão ABRASF/Betha |
| `desconhecido` | Fallback (não lança) |

### Retorno `XMLMetadata`

```ts
{
  tipo, numero, serie, chave,
  dataEmissao, emitenteCnpj, emitenteNome,
  destinatarioCnpj, destinatarioNome,
  valorTotal, naturezaOperacao, municipio, status
}
```

### Funções

- `parseXML(content: string): XMLMetadata` — parse completo
- `detectaTipoXML(content: string): TipoXML` — detecção rápida por string (sem parse completo)

---

## Histórico de Eventos — Configuração (`src/lib/historico-config.ts`)

Importável em Client Components (sem dependência de servidor).

### Tipos de Evento (`TipoEvento`)

| Evento | Label UI | Ícone |
|--------|----------|-------|
| `whatsapp_enviado` | WhatsApp enviado | chat |
| `email_enviado` | E-mail enviado | mail |
| `email_recebido` | E-mail recebido | mark_email_unread |
| `ligacao` | Ligação | call |
| `nota_interna` | Nota interna | sticky_note_2 |
| `contrato_gerado` | Contrato gerado | description |
| `contrato_assinado` | Contrato assinado | verified |
| `documento_enviado` | Documento enviado | upload_file |
| `tarefa_criada` / `tarefa_concluida` | Tarefa | task_alt / check_circle |
| `cliente_ativado` | Cliente ativado | person_check |
| `ia_escalada` | Escalado para humano | support_agent |
| `humano_assumiu` | Atendimento assumido | manage_accounts |
| `ia_retomada` | Devolvido para IA | smart_toy |
| `escalacao_resolvida` | Atendimento resolvido | check_circle |
| `agente_executou` / `agente_falhou` | Ação/Falha do agente | build / error |
| `cliente_criado` | Cliente criado | person_add |
| string livre | fallback: tipo como label | circle |

---

## Evolution API Client (`src/lib/evolution.ts`)

Client completo para Evolution API (open-source WhatsApp). Inclui circuit breaker e retry.

### Circuit Breaker

- Abre após **5 falhas consecutivas** (CIRCUIT_FAILURE_THRESHOLD)
- Permanece aberto por **1 minuto** (CIRCUIT_RESET_MS)
- Estado `half-open`: permite 1 sonda após o timeout

### Funções de envio (com retry + exponential backoff)

| Função | Tentativas | Erros 4xx |
|--------|-----------|-----------|
| `sendText(cfg, to, text)` | 4 (0s, 5s, 15s, 45s) | Sem retry — número inválido/bloqueado |
| `sendMedia(cfg, to, opts)` | 4 (0s, 5s, 15s, 45s) | Sem retry |

### Funções administrativas (sem retry)

| Função | Descrição |
|--------|-----------|
| `createInstance(cfg)` | Cria instância Baileys |
| `getConnectionState(cfg)` | QR code + status de conexão |
| `connectInstance(cfg)` | Gera novo QR (reconectar) |
| `logoutInstance(cfg)` | Logout WhatsApp |
| `deleteInstance(cfg)` | Remove instância |
| `deleteMessage(cfg, jid, msgId)` | Apaga mensagem (funciona ~60h, `fromMe: true`) |
| `setWebhook(cfg, url)` | Configura webhook com `headers.apikey` para autenticação |
| `sendPresence(cfg, to, durationMs)` | Indicador de digitação — silencia erros |

**Config**: `EvolutionConfig = { baseUrl, apiKey, instance }` — apiKey descriptografada via `crypto.ts`.

---

## WhatsApp — Utilitários de Mídia (`src/lib/whatsapp/media.ts`)

Processamento de mídia recebida no pipeline WhatsApp.

### Funções

| Função | Descrição |
|--------|-----------|
| `downloadMedia(cfg, messageData)` | Download via Evolution API (`getBase64FromMediaMessage`) — timeout 10s |
| `downloadMediaDirect(message)` | Fallback: download direto do CDN do WhatsApp com descriptografia AES-256-CBC + HKDF-SHA256 (protocolo Baileys). Usado quando Evolution API falha (ex: `addressingMode: lid`) |
| `extractPdfText(buffer)` | Extrai texto de PDF com `pdf-parse` |
| `detectMediaType(msg)` | `audio` \| `image` \| `document` \| `sticker` \| `null` |
| `extractMediaCaption(msg)` | Caption/legenda de imagem ou documento |
| `extractMimeType(msg)` | mimeType da mensagem de mídia |

**Fallback de mídia**: `downloadMedia()` → `downloadMediaDirect()` → desiste (log + Sentry, sem erro fatal).

---

## WhatsApp — Comportamento Humano (`src/lib/whatsapp/human-like.ts`)

```ts
sendHumanLike(cfg, to, text): Promise<SendResult>
```
- Divide o texto em chunks via `splitIntoChunks()`
- Para cada chunk: `sendPresence()` (typing) → delay calculado → `sendText()`
- Delay calculado por `calcTypingDelay(chunk, min=1200ms, max=4500ms)`
- Fail-fast: para no primeiro chunk com falha de envio

---

## WhatsApp — Classificação de Documentos (`src/lib/whatsapp/action-router.ts`)

Chamado em `processar-pendentes.ts` **antes** do `askAI` principal quando a mensagem contém mídia.

**Fluxo**:
1. Detecta se há mídia (`mediaContentParts` != null, ou caption especial)
2. Usa IA (Claude) para classificar em: `nota_fiscal | comprovante_pagamento | extrato_bancario | holerite | boleto | contrato | documento_pessoal | outro`
3. Extrai campos: `valor, data, emitente, descricao` (uso interno — nunca exibido ao cliente)
4. Registra `Interacao` com tipo `documento_recebido_whatsapp` + indexa no RAG (fire-and-forget)
5. Retorna `contextoIA` para injetar no `systemExtra` do próximo `askAI`

**Importante**: o cadastro no CRM acontece só quando o cliente confirma e a tool `anexarDocumentoChat` é chamada. A classificação é silenciosa.

---

## WhatsApp — Boas-vindas (`src/lib/whatsapp/boas-vindas.ts`)

```ts
enviarBoasVindasWhatsApp(cliente: ClienteBasico): Promise<void>
```
- Chamado como fire-and-forget no webhook ZapSign após conversão Lead→Cliente
- Gera magic link do portal (válido 48h) + envia via `sendText()`
- Silencia falha se Evolution API não está configurada
- Se geração do token falhar: envia mensagem sem link (degradação graciosa)

---

## Classificação de Documentos (`src/lib/services/classificar-documento.ts`)

Decide se um arquivo recebido deve ser arquivado ou é apenas contexto conversacional.

| Canal | Contexto usado |
|-------|---------------|
| WhatsApp | Últimas 5 mensagens da conversa (`buildContextoConversa`) |
| Email | Assunto + corpo do email (`buildContextoEmail`) |
| Portal | Últimas 5 interações do cliente (`buildContextoPortal`) |

**Regra**: XMLs (NFe, CT-e, NFS-e) são **sempre** arquivados — nunca conversacionais.  
**Bias para arquivar**: "Em caso de dúvida, SEMPRE arquive."

**Funções de contexto exportadas**:
- `buildContextoConversa(conversaId, limite=5)` → string PT-BR
- `buildContextoPortal(clienteId, limite=5)` → string com interações
- `buildContextoEmail(assunto, corpo)` → string formatada

---

## Extração de Conteúdo (`src/lib/services/extrair-conteudo-documento.ts`)

Extrai conteúdo de arquivo para uso pela IA (classificação e resumo).

| Tipo | Estratégia | Limite |
|------|-----------|--------|
| XML | xmlMetadata já parseado ou buffer → texto | 8.000 chars |
| PDF | `pdf-parse` sem LLM | 8.000 chars |
| `image/*` | base64 para Vision (Claude/OpenAI/Google) | 4 MB |
| `text/plain` | leitura direta do buffer | 8.000 chars |
| `text/csv` | leitura direta | 4.000 chars |
| outros | `null` (não processável) | — |

**URL signing automático**: se a URL pertence ao `STORAGE_PUBLIC_URL` (R2 privado), gera URL assinada automaticamente antes de fazer fetch.

---

## Transcrição de Áudio (`src/lib/ai/transcribe.ts`)

```ts
transcribeAudio(audioBuffer, mimeType, groqApiKey): Promise<string>
```
- Provider: Groq Whisper `whisper-large-v3-turbo` (rápido, suporta PT-BR)
- Suporta: ogg (padrão PTT WhatsApp), mp4, mp3, webm, wav
- Timeout: 30s via `AbortSignal.timeout()`
- Chamado no pipeline WA para mensagens de áudio

---

## ClickSign Client (`src/lib/clicksign.ts`)

Integração de assinatura eletrônica brasileira (alternativa ao ZapSign para leads manuais).

### Função principal

```ts
enviarClickSign(rawKey, pdfBuffer, nomeContrato, signatario): Promise<{docKey, signUrl}>
```

**Fluxo em 3 passos com retry (backoff 1s → 3s)**:
1. `POST /api/v1/documents` — cria documento (PDF base64)
2. `POST /api/v1/signers` — cria signatário com `delivery: 'email'`
3. `POST /api/v1/lists` — vincula signatário ao documento

**Resiliência**:
- Retry apenas em erros de rede e 5xx (não 4xx)
- `docKey` logado antes dos passos 2 e 3 — permite cancelamento manual em caso de falha parcial
- `sign_url`: retornada via `list.sign_url` (Enterprise) → `signer.sign_url` → token fallback

---

## SpedyClient (`src/lib/spedy.ts`)

Client completo da API Spedy (plataforma fiscal de NFS-e). 485 linhas.

### Instanciação

```ts
// Owner (escritório) — gerencia empresas secundárias
const client = getSpedyOwnerClient({ spedyApiKey, spedyAmbiente? })

// Cliente (emissão em nome do cliente)
const client = getSpedyClienteClient({ spedyApiKey, spedyAmbiente? })
```

### Métodos NFS-e

| Método | Endpoint | Descrição |
|--------|---------|-----------|
| `emitirNfse(input)` | `POST /service-invoices` | Emite com `status: 'enqueued'` |
| `consultarNfse(id)` | `GET /service-invoices/{id}` | Status atual |
| `cancelarNfse(id, justificativa)` | `DELETE /service-invoices/{id}` | Cancela (204 No Content) |
| `reemitirNfse(id)` | `POST /service-invoices/{id}/issue` | Reemite rejeitada/falhou |
| `consultarStatusNfsePrefeitura(id)` | `POST /service-invoices/{id}/check-status` | Força consulta na prefeitura |
| `reenviarEmailNfse(id)` | `POST /service-invoices/{id}/resend-email` | Reenvio de email ao tomador |
| `pdfUrl(id)` | — | URL pública PDF (sem API key) |
| `xmlUrl(id)` | — | URL pública XML (sem API key) |

### Outros métodos

- `listarMunicipios(params?)` / `verificarMunicipio(codigoIbge)` — lookup de municípios habilitados
- `criarEmpresa / atualizarEmpresa / listarEmpresas` — gestão de empresas (Owner key)
- `criarWebhook / reativarWebhook / desativarWebhook / listarWebhooks`
- `testarConexao()` → boolean

### Retry/Error

- **3 tentativas** com backoff exponencial (500ms → 1500ms → 4500ms + jitter 0-200ms)
- **429**: respeita header `x-rate-limit-reset`
- **403**: sem retry imediato (chave inválida)
- **4xx outros**: sem retry
- **5xx + erros de rede**: retry com backoff
- **`SpedyError.isSpedyValidation`**: code começa com `SPD` (rejeição de validação, não SEFAZ)

### Helpers globais

```ts
spedyPdfUrl(spedyId, ambiente?)  → URL pública PDF sem instanciar client
spedyXmlUrl(spedyId, ambiente?)  → URL pública XML sem instanciar client
```
