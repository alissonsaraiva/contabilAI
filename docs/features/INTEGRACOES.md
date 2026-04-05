# INTEGRACOES — Integrações Externas

> **Sistema:** AVOS v3.10.23 | **Fonte:** `SISTEMA.md` (extraído)

---

## Asaas (Cobrança)

- **Tipo**: REST API externa
- **Auth**: `asaasApiKey` salvo por escritório no banco (`asaasAmbiente`: `sandbox` | `producao`)
- **Webhook**: `asaasWebhookToken` no header `access_token` → `/api/webhooks/asaas`
- **Formas suportadas**: apenas PIX e boleto (cartão fora do escopo)
- **Ponto de falha**: Asaas offline → cobranças não atualizadas. Sem retry automático.
- **Arquivo principal**: `src/lib/asaas.ts`, `src/lib/services/asaas-sync.ts`
- **Cancelar cobrança**: `DELETE /payments/{id}` (não usar `POST /payments/{id}/cancel` — retorna 404)
- **Provisionar manualmente**: `POST /api/crm/clientes/[id]/provisionar` — idempotente

## Spedy (NFS-e)

- **Tipo**: REST API por empresa (cada empresa tem sua própria `spedyApiKey`)
- **Auth**: header `X-Api-Key` (não `Authorization`)
- **Webhook**: token = SHA-256 da API key → `/api/webhooks/spedy/[token]`
- **Ponto de falha**: Webhook pode chegar fora de ordem; cron de reconciliação atua como fallback (1h)
- **Arquivo principal**: `src/lib/services/notas-fiscais.ts`, `src/lib/services/nfse/`

## Evolution API (WhatsApp)

- **Tipo**: REST API self-hosted (provavelmente na VPS ou terceiro)
- **Auth**: Bearer token (`EVOLUTION_API_KEY`)
- **Webhook**: `/api/whatsapp/webhook` (sem autenticação de payload — gap de segurança)
- **Ponto de falha**: Instância desconectada → mensagens não chegam. Sem health check automático.

## Cloudflare R2 (Storage)

- **Tipo**: S3-compatible
- **Auth**: `STORAGE_ACCESS_KEY_ID` + `STORAGE_SECRET_ACCESS_KEY`
- **URLs**: bucket privado — sempre usar URL assinada (`getDownloadUrl(key, segundos)`) para envio externo
- **⚠️ URLs públicas brutas retornam 403** — Evolution API e qualquer serviço externo precisa de URL assinada
- **Fluxo humano→WhatsApp** (`/api/conversas/[id]/mensagem`): detecta URL R2 pelo prefixo `STORAGE_PUBLIC_URL` e converte para signed URL (5 min) antes de chamar `sendMedia`
- **Ponto de falha**: signed URLs expiram — não armazenar nem reusar; sempre gerar na hora do envio

## Zapsign / Clicksign (Assinatura Eletrônica)

- **Tipo**: REST API (selecionável por escritório)
- **Webhook**: `/api/webhooks/zapsign` e `/api/webhooks/clicksign`
- **Idempotência**: `WebhookLog` previne processamento duplicado

## DocuSeal (Self-hosted)

- **URL**: `http://82.25.79.193:32825`
- **Tipo**: Iframe embed (não REST puro)
- **Ponto de falha**: ⚠️ Single point of failure — está na VPS

## SERPRO (CNPJ/CPF)

- **Auth**: tokens salvos no banco (`Escritorio.serproCpfToken`, `serproCnpjToken`)
- **Ponto de falha**: Rate limit e autenticação vencida causam falha silenciosa no auto-fill

## Anthropic API (IA Principal)

- **Modelos**: Claude Haiku 4.5 (padrão), Claude Sonnet/Opus (configurável)
- **Ponto de falha**: Sem fallback automático para outro provider se API cair

## Webhooks Recebidos

| Rota | Validação | Descrição |
|------|-----------|-----------| 
| `/api/webhooks/asaas` | `asaasWebhookToken` no header | Pagamentos/cobranças |
| `/api/webhooks/spedy/[token]` | token = SHA-256 da API key | Status NFS-e |
| `/api/webhooks/zapsign` | HMAC do payload | Assinatura de contrato |
| `/api/webhooks/clicksign` | Token do escritório | Assinatura de contrato |
| `/api/whatsapp/webhook` | — | Mensagens WhatsApp (Evolution API) |
