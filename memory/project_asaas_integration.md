---
name: project_asaas_integration
description: Integração Asaas — estado atual do código, decisões, gaps e comportamentos validados em sandbox
type: project
---

# Integração Asaas — Estado atual (auditado 2026-04-03)

**Why:** Asaas é responsável por todo o fluxo de cobrança — gera mensalidades automaticamente, envia notificações ao cliente e gerencia inadimplência. O AVOS reage via webhook para manter o CRM sincronizado.

**Ponto de entrada:** Webhook DocuSeal (conversão Lead→Cliente) → `provisionarClienteAsaas()`.

## Decisões confirmadas pelo Alisson

- **Ambiente:** sandbox (`$aact_hmlg_...`), produção depois
- **Alterar vencimento:** atualiza cobranças em aberto E futuras (`updatePendingPayments: true`)
- **Lembrete de vencimento automático:** ❌ NÃO implementar cron D-3 — Asaas cobre email D-10 e D-0. D-3 não é suportado pelo Asaas (mínimo D-5).
- **Notificação de inadimplência automática ao cliente:** ❌ NÃO — Asaas cobre email D+0 e D+7. Deixar Asaas cuidar disso.
- **WhatsApp de confirmação de pagamento:** NÃO enviar
- **WhatsApp manual de cobrança:** ✅ manter tool `enviarCobrancaInadimplente` — operador decide cobrar por WhatsApp on-demand
- **WhatsApp lembrete manual:** ✅ manter tool `enviarLembreteVencimento` — operador pode enviar lembrete personalizado
- **Bell no CRM quando inadimplente:** ✅ manter — notificação interna da equipe (não vai ao cliente)
- **Segunda via:** gerar NOVA cobrança no Asaas (não restaurar a vencida)
- **Formas de pagamento:** apenas PIX e boleto (cartão fora do escopo)
- **Multa/juros:** ❌ NÃO configurar (por enquanto)

## O que já está implementado

- `src/lib/asaas.ts` — cliente HTTP completo (customers, subscriptions, payments, QR, barcode)
- `src/lib/services/asaas-sync.ts` — provisionar, sincronizar, alterar vencimento/forma, suspender, reativar, segunda via
- `src/app/api/webhooks/asaas/route.ts` — trata 7 eventos (CREATED, RECEIVED, CONFIRMED, OVERDUE, UPDATED, DELETED, REFUNDED)
- `src/app/api/crm/clientes/[id]/cobrancas/route.ts` — GET (lista + resumo) + POST (forçar sync)
- `src/app/api/crm/clientes/[id]/cobrancas/[cobrancaId]/segunda-via/route.ts`
- `src/app/api/crm/clientes/[id]/vencimento/route.ts` — PATCH
- `src/app/api/crm/clientes/[id]/forma-pagamento/route.ts` — PATCH
- `src/app/api/crm/clientes/[id]/provisionar/route.ts` — POST (idempotente, manual fallback)
- `src/app/api/portal/financeiro/cobrancas/route.ts` — inclui `invoiceUrl` no retorno
- `src/app/api/portal/financeiro/cobranca-aberta/route.ts`
- `src/app/api/portal/financeiro/segunda-via/route.ts`
- `src/app/api/portal/financeiro/vencimento/route.ts` — PATCH: self-service alterar dia (1–28)
- `src/app/api/portal/financeiro/forma-pagamento/route.ts` — PATCH: self-service PIX ↔ boleto
- `src/app/api/portal/financeiro/extrato/route.ts` — GET: CSV histórico completo (BOM UTF-8)

## Comportamentos da API validados em sandbox

- `cycle=MONTHLY` **obrigatório** na criação de subscription
- `value > 0` obrigatório (API retorna `invalid_value` para zero)
- Cancelar cobrança: **`DELETE /payments/{id}`** — o endpoint `POST /payments/{id}/cancel` retorna 404 (bug corrigido)
- `invoiceUrl` é **público** — link de pagamento direto, sem auth, pode ser enviado por WhatsApp
- `GET /payments/{id}/pixQrCode` funciona para BOLETO também (Asaas gera QR para tudo)
- Webhook header: Asaas usa **`access_token`** (o código aceita também `asaas-access-token`)
- `scheduleOffset` válidos para `DUEDATE_WARNING`: 5, 10, 15, 30 dias (3 dias não é aceito)

## Notificações nativas do Asaas (automáticas — email e SMS)

8 tipos por customer criados automaticamente:
- `PAYMENT_CREATED` → email+SMS cliente
- `PAYMENT_DUEDATE_WARNING` (D-10 e D-0) → email+SMS cliente
- `SEND_LINHA_DIGITAVEL` (D-0) → email+SMS cliente (boleto)
- `PAYMENT_OVERDUE` (D+0 e D+7) → email+SMS cliente + email escritório
- `PAYMENT_RECEIVED` → email+SMS cliente + email escritório
- `PAYMENT_UPDATED` → email+SMS cliente

**WhatsApp nativo desabilitado** por padrão (`whatsappEnabledForCustomer: false`) — requer plano adicional.

## ⚠️ Gaps — decisões pendentes

1. **`invoiceUrl` não enviado no WhatsApp de cobrança** — `enviarCobrancaInadimplente` usa `pixCopiaECola` ou `linkBoleto` local. Considerar incluir também o `invoiceUrl` (link público Asaas) como fallback quando não há dados locais.
   - OBS: `invoiceUrl` agora é **armazenado em `CobrancaAsaas.invoiceUrl`** (migration `20260404225905`) e exibido no portal como "Comprovante" nas cobranças RECEIVED.

## ✅ Decisões fechadas (não implementar)

- **Cron D-3 automático:** descartado — Asaas cobre email D-10, D-0, D+7
- **WhatsApp automático de inadimplência:** descartado — Asaas cobre
- **Multa/juros:** descartado por enquanto

## Telas implementadas (auditado 2026-04-03)

- ✅ `src/components/crm/cliente-financeiro-tab.tsx` — aba Financeiro completa: resumo, vencimento, forma, QR PIX, boleto, segunda via, histórico, sync, provisionar
- ✅ `src/app/(crm)/crm/financeiro/inadimplentes/page.tsx` — lista com cobrança individual e em lote (3 níveis)
- ✅ `src/components/portal/portal-financeiro-client.tsx` — portal do cliente: QR/boleto, segunda via, histórico, **alterar vencimento (self-service)**, **alterar forma pagamento (self-service)**, **comprovante de pagamento**, **exportar extrato CSV** (implementado 2026-04-04)
- ✅ Badge inadimplente na lista de clientes — `STATUS_CLIENTE_COLORS` já inclui vermelho
- ✅ Filtro por status=inadimplente na search bar — inclui todos os status automaticamente
- ✅ Config Asaas em `/crm/configuracoes/integracoes` — API key, ambiente, webhook token

## Único gap restante

- ❌ Widget de inadimplência no dashboard CRM — sem dados financeiros/Asaas atualmente
