# COBRANCA — Integração Asaas

> **Sistema:** AVOS v3.10.24 | **Fonte:** `SISTEMA.md` (extraído)

---

## Fluxo de Cobrança

```
1. Cliente provisionado: createCustomer() → salva asaasCustomerId
2. Subscription criada: createSubscription() (cycle=MONTHLY obrigatório) → salva asaasSubscriptionId
3. Asaas gera cobranças automaticamente
4. Webhook /api/webhooks/asaas (header: access_token):
   └── PAYMENT_CREATED   → upsert CobrancaAsaas + enriquece PIX/boleto em background
   └── PAYMENT_RECEIVED  → marca RECEIVED, reativa inadimplente se aplicável
   └── PAYMENT_CONFIRMED → idem RECEIVED (Asaas envia um ou outro por forma de pagamento)
   └── PAYMENT_OVERDUE   → status: inadimplente + notifica equipe
   └── PAYMENT_UPDATED   → atualiza data/valor + re-enriquece + seta pixGeradoEm
   └── PAYMENT_DELETED   → cancela cobrança local
   └── PAYMENT_REFUNDED  → marca REFUNDED
5. Se inadimplente:
   └── Automático: notificar operador
   └── Manual: operador usa ferramenta de cobrança
   └── IA usa enviarCobrancaInadimplente()
6. Segunda via: gerarSegundaVia() → cria nova cobrança avulsa no Asaas + cancela original
7. invoiceUrl: capturado em todos os status (open + paid) no sincronizarCobrancas — exposto no portal como "Comprovante" para cobranças RECEIVED
```

## Comportamentos da API Asaas (validados sandbox 2026-04-03)

- `cycle` é **obrigatório** na criação de subscription. O código usa sempre `MONTHLY`.
- `value` deve ser **> 0** — API retorna `invalid_value` para valor zero.
- Cancelar cobrança: usar **`DELETE /payments/{id}`** (retorna `{deleted:true}`). O endpoint `POST /payments/{id}/cancel` retorna 404 — corrigido no código.
- `GET /payments/{id}/pixQrCode` funciona mesmo para cobranças BOLETO (Asaas gera QR para tudo). O código verifica `forma === 'pix'` antes de chamar — correto.
- `GET /payments/{id}/identificationField` retorna HTTP 400 para cobranças PIX.
- CPF/CNPJ duplicado: sandbox permite; produção pode rejeitar. Idempotência garantida via `asaasCustomerId` persistido antes da subscription.
- `nextDueDate` na resposta de subscription = vencimento da **próxima** cobrança após a primeira gerada.
- Webhook header: Asaas envia no header **`access_token`**. O código aceita também `asaas-access-token` como fallback.
- `invoiceUrl` é **público** (sem auth) — link direto de pagamento. Pode ser enviado ao cliente via WhatsApp sem precisar do portal.
- `GET /payments?customer=...&status=PENDING` — filtro por status funciona.

## Notificações Nativas do Asaas (automáticas por customer)

| Evento | scheduleOffset | Destinatários |
|--------|---------------|---------------|
| `PAYMENT_CREATED` | 0 | Cliente (email+SMS) |
| `PAYMENT_DUEDATE_WARNING` | 10 dias antes | Cliente (email+SMS) |
| `PAYMENT_DUEDATE_WARNING` | 0 (dia do vencimento) | Cliente (email+SMS) |
| `SEND_LINHA_DIGITAVEL` | 0 | Cliente (email+SMS) — boleto |
| `PAYMENT_OVERDUE` | 0 | Escritório + cliente (email+SMS) |
| `PAYMENT_OVERDUE` | 7 dias após | Cliente (email+SMS) |
| `PAYMENT_RECEIVED` | 0 | Escritório + cliente (email+SMS) |
| `PAYMENT_UPDATED` | 0 | Cliente (email+SMS) |

- `scheduleOffset` válidos para `DUEDATE_WARNING`: 5, 10, 15, 30 dias (3 dias não suportado)
- WhatsApp nativo do Asaas: desabilitado por padrão — requer plano adicional
- `notificationDisabled: true` no customer desabilita todos os emails/SMS do Asaas

## Divisão de Responsabilidades (decisão fechada)

| Responsável | Ação |
|-------------|------|
| **Asaas** | Todas as notificações automáticas ao cliente (email D-10, D-0, D+7, confirmação de pagamento) |
| **AVOS** | Sincronizar status no CRM via webhook + notificação interna da equipe (bell) quando inadimplente |
| **Operator/IA** | Tools manuais `enviarCobrancaInadimplente` e `enviarLembreteVencimento` para WhatsApp on-demand |
| **`buscarCobrancaAberta` (IA)** | Retorna cobrança PENDING/OVERDUE com PIX/boleto; quando não há, retorna último pagamento RECEIVED |

- ❌ **Cron D-3 automático**: não implementar — Asaas cobre
- ❌ **Multa/juros**: não configurar por enquanto

## Telas Implementadas (auditado 2026-04-03)

### CRM
- `src/components/crm/cliente-financeiro-tab.tsx` — aba Financeiro no detalhe do cliente:
  - Resumo (4 cards): mensalidade, em aberto, em atraso, status Asaas
  - **Botão "Provisionar no Asaas"** — exibido no card Status Asaas e no empty state quando `asaasCustomerId` é null. Chama `POST /api/crm/clientes/[id]/provisionar` (com confirmação). Idempotente.
  - Alterar vencimento/forma
  - QR code PIX, código de barras boleto
  - Segunda via
  - Histórico 24 cobranças
  - Sync manual

- `src/app/(crm)/crm/financeiro/inadimplentes/page.tsx` + `src/components/crm/inadimplentes-client.tsx`:
  - Lista de inadimplentes
  - Cobrança individual e em lote (3 níveis: gentil/urgente/reforço) via WhatsApp

### Portal
`src/components/portal/portal-financeiro-client.tsx`:
- Cobrança em aberto com QR/boleto
- Alerta PIX expirado
- Segunda via
- Histórico 12 cobranças
- **Alterar vencimento (self-service)** — `PATCH /api/portal/financeiro/vencimento` (1–28)
- **Alterar forma de pagamento (self-service)** — `PATCH /api/portal/financeiro/forma-pagamento` (PIX ↔ boleto)
- **Comprovante de pagamento (invoiceUrl)**
- **Exportar extrato CSV** — `GET /api/portal/financeiro/extrato` (BOM UTF-8 para Excel)

### Status Visual
- Badge "Inadimplente" na lista de clientes: ✅ renderizado via `STATUS_CLIENTE_COLORS` (vermelho)
- Filtro por status=inadimplente na lista de clientes: ✅ search bar inclui todos os status automaticamente
- Config Asaas em `/crm/configuracoes/integracoes`: ✅ campos API key, ambiente (sandbox/producao), webhook token

## Gap Restante

- Widget de inadimplência no dashboard CRM (`/crm/dashboard`) — sem dados financeiros/Asaas atualmente

## Config da Integração

- **Auth**: `asaasApiKey` salvo por escritório no banco (`asaasAmbiente`: `sandbox` | `producao`)
- **Webhook**: `asaasWebhookToken` no header `access_token` → `/api/webhooks/asaas`
- **Formas suportadas**: apenas PIX e boleto (cartão fora do escopo)
- **Ponto de falha**: Asaas offline → cobranças não atualizadas. Sem retry automático.
- **Arquivo principal**: `src/lib/asaas.ts`, `src/lib/services/asaas-sync.ts`
- **Provisionar manualmente**: `POST /api/crm/clientes/[id]/provisionar` — idempotente, reutiliza IDs existentes. Botão disponível na aba Financeiro do CRM quando cliente não provisionado.
- **Campo `pixGeradoEm`** em `CobrancaAsaas`: setado apenas quando QR Code chega do Asaas (`enriquecerPagamento`, `gerarSegundaViaAsaas`, webhook `PAYMENT_UPDATED`). Usado em vez de `atualizadoEm` para calcular expiração do PIX — `atualizadoEm` é resetado por qualquer webhook e não é confiável para esse fim.
