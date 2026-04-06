# INTEGRACOES — Integrações Externas

> **Sistema:** AVOS v3.10.27 | **Fonte:** `SISTEMA.md` (extraído)

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

## SERPRO — Integra Contador (Receita Federal)

> Implementado em v3.10.27. Módulo separado do SERPRO CPF/CNPJ.

- **Tipo**: OAuth 2.0 Client Credentials + REST API Gateway SERPRO
- **Auth**: `integraContadorClientId` + `integraContadorClientSecret` (ENCRYPTED) → Bearer token cacheado (TTL ~3500s)
- **Arquivo principal**: `src/lib/services/integra-contador.ts`
- **API de config**: `GET/PUT/POST /api/configuracoes/integra-contador`
- **Ambientes**:
  - Homologação: `gateway.staging.estaleiro.serpro.gov.br`
  - Produção: `gateway.estaleiro.serpro.gov.br`
- **Módulos implementados**:
  | Módulo | Endpoint | Tool do Agente |
  |--------|----------|----------------|
  | `integra-sitfis` | `/integra-sitfis/v1/situacaofiscal/{cnpj}` | `consultarSituacaoFiscal` |
  | `integra-sn` | `/integra-sn/v1/pgdas/{cnpj}/{periodo}` | `consultarPGDAS` |
  | `integra-mei` | `/integra-mei/v1/emitir-das/{cnpj}/{competencia}` | `gerarDASMEI` |
  | `integra-mei` | `/integra-mei/v1/emitir-ccmei/{cnpj}` | `emitirCertidaoMEI` |
  | `integra-caixapostal` | `/integra-caixapostal/v1/mensagens/{cnpj}` | `consultarCaixaPostalRF` |
  | `integra-procuracoes` | `/integra-procuracoes/v1/procuracao/{outorgante}/{outorgado}` | — (service only) |
  | `integra-pagamento` | `/integra-pagamento/v1/pagamento/{cnpj}/{competencia}` | — (service only via `verificarPagamentoDASMEI`) |
- **Pré-requisitos**:
  - Contrato ativo com o SERPRO para Integra Contador
  - Cada cliente MEI deve conceder procuração digital ao escritório no e-CAC
  - Sem procuração → RF retorna 403 para aquele CNPJ (erro por cliente, não global)
  - `Empresa.procuracaoRFAtiva` = cache local do status; `Empresa.procuracaoRFVerificadaEm` = timestamp da última consulta
- **Resiliência**:
  - Token caching: `tokenCache` (Map em memória) com TTL, invalidado ao salvar novas credenciais
  - Retry exponencial: 3 tentativas, delays 1s/2s/4s
  - Sem retry em 400/401/403/404 (erros definitivos)
  - Timeout: 30s por requisição
  - Sentry em todos os catch com `{ module, operation }`
- **Certificado e-CNPJ**: armazenado como base64 ENCRYPTED em `integraContadorCertBase64` — para uso futuro em mTLS (endpoints que exigem assinatura digital). OAuth simples não requer certificado.
- **Ponto de falha**: SERPRO offline → todas as tools retornam erro descritivo. Token expirado → refresh automático. Procuração ausente → 403 por CNPJ (não global).
- **Procuração RF**: verificação automática via `integra-procuracoes` implementada em v3.10.27 — ver cron + portal abaixo.

### DAS MEI — Automação Completa (v3.10.27)

> Geração, lembretes, verificação de pagamento e entrega multicanal das DAS para clientes MEI.

**Schema** (`prisma/schema.prisma`):
- `DasMEI` model: `empresaId`, `clienteId`, `competencia` (AAAAMM), `codigoBarras`, `valor`, `dataVencimento`, `urlDas`, `status` (enum: `pendente|paga|vencida|erro`), `erroMsg`, `notificadoEm`, `lembreteEnviadoEm`, `raw`
- Constraint única: `@@unique([empresaId, competencia])` — geração idempotente
- `Empresa.procuracaoRFAtiva Boolean @default(false)` — cache para filtrar cron sem hit na RF
- `Escritorio`: `dasMeiVencimentoDia`, `dasMeiDiasAntecedencia`, `dasMeiCanalEmail/Whatsapp/Pwa`

**Serviço central**: `src/lib/services/das-mei.ts`
- `gerarESalvarDASMEI(clienteId, competencia?)` — chama SERPRO integra-mei, upsert, notifica
- `sincronizarPagamentoDAS(dasId)` — verifica via integra-pagamento, atualiza status
- `notificarDASDisponivel / notificarDASVencimento / notificarDASAtrasada` — multicanal (email + WhatsApp + PWA)

**API Routes — DAS MEI**:
- `GET /api/crm/clientes/[id]/das-mei` → `{ regime, procuracaoRFAtiva, dasMeis[] }`
- `POST /api/crm/clientes/[id]/das-mei` → gera DAS via SERPRO (body: `{ competencia? }`)
- `PATCH /api/crm/clientes/[id]/das-mei` → toggle `procuracaoRFAtiva` (body: `{ procuracaoRFAtiva: boolean }`)
- `PATCH /api/crm/clientes/[id]/das-mei/[dasId]` → atualiza status manualmente (com ownership check)
- `POST /api/crm/clientes/[id]/das-mei/[dasId]/sincronizar` → checa pagamento via SERPRO
- `GET /api/portal/financeiro/das-mei` → retorna DAS do cliente logado (only MEI)

**API Routes — Procuração RF (portal)**:
- `GET /api/portal/procuracao-rf` → `{ regime, procuracaoRFAtiva, verificadaEm }`
- `POST /api/portal/procuracao-rf` → aciona verificação imediata via SERPRO (throttle 10 min); degrada graciosamente se módulo não contratado

**Cron jobs** (todos gated por `integraContadorEnabled`):
| Endpoint | Schedule | Função |
|----------|----------|--------|
| `POST /api/cron/gerar-das-mei` | `0 8 * * *` | Gera DAS para todos MEI com `procuracaoRFAtiva=true` no dia calculado (`vencDia - diasAnt`) |
| `POST /api/cron/lembrete-das-mei` | `0 9 * * *` | Envia lembrete de vencimento hoje (pendente), grava `lembreteEnviadoEm` |
| `POST /api/cron/verificar-pagamento-das-mei` | `0 10 * * *` | Verifica pagamento +1/+3/+5 dias após vencimento; alerta admin no dia +5 |
| `POST /api/cron/verificar-procuracao-rf` | `0 9 * * *` | Verifica procuração de todos MEI com CNPJ: sem procuração → diário; com procuração ativa → a cada 30 dias. Atualiza `procuracaoRFAtiva` + `procuracaoRFVerificadaEm` |

**Healthchecks**: `HC_GERAR_DAS_MEI`, `HC_LEMBRETE_DAS_MEI`, `HC_VERIFICAR_PAGAMENTO_DAS_MEI`, `HC_VERIFICAR_PROCURACAO_RF`

**Cron `verificar-procuracao-rf` — comportamento detalhado**:
- Aborta com aviso (não falha o job) se `integra-procuracoes` não contratado ou `Escritorio.cnpj` não configurado
- `status === 'ativa'` → `procuracaoRFAtiva = true`; qualquer outro status → `false`
- 404 do SERPRO → `status = 'nao_encontrada'` (tratado como sem procuração)
- Erros por cliente são capturados individualmente (não interrompem o batch)

**Tools do Agente**:
| Tool | Função |
|------|--------|
| `consultarDASMEI` | Lista DAS armazenadas com status, valor, vencimento, código de barras e link |
| `enviarDASMEICliente` | Envia DAS ao cliente (código de barras + urlDas) via WhatsApp e/ou email |

**UI**:
- CRM → lista de clientes: badge `Proc. RF` vermelho para MEI com `procuracaoRFAtiva = false`
- CRM → detalhe do cliente: banner de alerta vermelho quando MEI sem procuração ativa (com data da última verificação)
- CRM → aba Financeiro: seção DAS MEI visível apenas para `regime === 'MEI'` (badge procuração clicável, botão gerar, botão gerar competência específica, tabela com ações copiar/link/sincronizar)
- Portal do cliente → `/portal/financeiro`: banner vermelho clicável "Autorização Receita Federal pendente" quando `procuracaoRFAtiva = false` (acima da seção DAS MEI)
- Portal do cliente → `/portal/procuracao-rf`: página dedicada com status em destaque, botão **"Já autorizei — verificar agora"** (chama `POST /api/portal/procuracao-rf`), passo a passo do e-CAC e explicação das permissões

**Configuração** (UI em `/crm/configuracoes/integracoes`): `integra-pagamento` adicionado aos módulos; subsection DAS MEI visível apenas quando `integra-mei` está selecionado.

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
