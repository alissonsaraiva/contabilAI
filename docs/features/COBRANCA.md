# COBRANCA — Integração Asaas

> **Sistema:** AVOS v3.10.26 | **Fonte:** `SISTEMA.md` (extraído)

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
  - **Alterar valor da mensalidade** — `PATCH /api/crm/clientes/[id]/mensalidade`. Confirma via dialog, propaga para Asaas (`updatePendingPayments: true`). Card "Mensalidade" atualiza via estado local (sem reload).
  - Alterar vencimento/forma
  - QR code PIX, código de barras boleto
  - Segunda via
  - Histórico 24 cobranças
  - Sync manual
  - **Widget Limite MEI** (v3.10.28, `variant="crm"`) — exibido apenas para `regime === 'MEI'`; busca `GET /api/crm/clientes/[id]/limite-mei` em paralelo com a DAS; mostra régua, percentual e breakdown mensal

- `src/app/(crm)/crm/financeiro/inadimplentes/page.tsx` + `src/components/crm/inadimplentes-client.tsx`:
  - Lista de inadimplentes
  - Cobrança individual e em lote (3 níveis: gentil/urgente/reforço) via WhatsApp

- `src/app/(crm)/crm/financeiro/reajuste/page.tsx` + `src/components/crm/reajuste-mensalidades-client.tsx`:
  - **Reajuste global de mensalidades** — acesso restrito a admin
  - Fluxo 4 etapas: configurar percentual → preview com simulação por cliente → confirmação → resultado
  - Aplica `POST /api/crm/financeiro/reajuste-mensalidades` com `{ percentual }`
  - Elegíveis: status `ativo` ou `inadimplente` com `valorMensal > 0`
  - Propaga para Asaas se tiver subscription; atualiza apenas banco se não tiver
  - Processa sequencialmente; continua em caso de erro individual; retorna relatório de erros
  - Valor mínimo resultante: R$ 1,00; intervalo permitido: -99% a +500%
  - Sidebar: grupo Financeiro → item "📈 Reajuste"

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

## Auto-Refresh de PIX Expirado (v3.10.26)

`refresharPixCobranca(cobrancaId)` em `src/lib/services/asaas-sync.ts` — renova QR Code no Asaas sem cancelar a cobrança:

```
- Só age em cobranças PENDING + formaPagamento='pix'
- Chama asaasGetPixQrCode(asaasId) → atualiza pixCopiaECola, pixQrCode, pixGeradoEm no banco
- Best-effort: captura erros com Sentry e retorna null em falha — nunca bloqueia o fluxo principal
```

**Onde é chamado automaticamente (PENDING + PIX > 20h):**
- `buildSystemExtra` (WhatsApp pipeline) — renova antes de injetar no contexto da IA
- `GET /api/portal/chat` — renova antes de montar o systemExtra do chat do portal
- `GET /api/portal/financeiro/cobranca-aberta` — renova antes de retornar ao PWA; responde `pixExpirado: false` se sucesso
- Tool `buscarCobrancaAberta` — renova inline e retorna código fresco

**Nunca auto-renova:**
- Cobranças OVERDUE (cliente em atraso deve gerar segunda via com nova data)
- CRM (`/api/crm/clientes/[id]/cobrancas`) — contador vê aviso de expirado e decide ação

## CRM — Indicador de PIX Expirado (v3.10.26)

`GET /api/crm/clientes/[id]/cobrancas` retorna `pixExpirado: boolean` por cobrança:
- Calculado com `pixGeradoEm ?? atualizadoEm` > 20h
- `cliente-financeiro-tab.tsx`: QR Code oculto + aviso laranja + botão "Copiar PIX" desabilitado quando expirado
- Contador sabe que deve gerar 2ª via em vez de copiar código inválido

## Comportamento da IA com PIX x Boleto (v3.10.26)

O `systemExtra` agora inclui `Forma de pagamento: PIX (não boleto bancário — se o cliente pedir "boleto", esclareça...)` quando `formaPagamento='pix'`. Garante que a IA:
- Não diga "Boleto enviado!" para cobranças PIX
- Corrija explicitamente o cliente que pede "boleto" quando a cobrança é PIX
- Aplica-se em WhatsApp (`contexto.ts`) e portal chat (`/api/portal/chat/route.ts`)

## Portal PWA — Melhorias PIX (v3.10.26)

`src/components/portal/portal-financeiro-client.tsx`:
- QR Code centralizado (176×176px, `h-44 w-44`)
- Botão "Copiar código PIX" full-width abaixo do QR Code

## Portal Chat (Clara) — Renderização PIX (v3.10.26)

`src/components/portal/portal-clara.tsx`:
- `preprocessarPix()`: detecta código EMV bruto (começa com `000201`) e envolve em code fence
- `PixChatCard`: card com botão de cópia + fallback iOS (setSelectionRange)
- Renderer `pre: () => <>{children}</>` evita `<pre><div>` inválido no HTML
- Tool `gerarSegundaViaAsaas` agora retorna PIX em code fence no `resumo` — garante renderização correta
