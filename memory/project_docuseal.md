---
name: project_docuseal
description: DocuSeal ABANDONADO — sistema usa ZapSign e ClickSign como provedores de assinatura
type: project
---

DocuSeal foi descartado. O sistema usa **ZapSign** e **ClickSign** como provedores de assinatura eletrônica.

**Why:** Decisão de março/2026 — ZapSign e ClickSign têm melhor integração e suporte a email nativo.

**How to apply:** Nunca referenciar DocuSeal. Lib em src/lib/zapsign.ts e src/lib/clicksign.ts. Provedor configurado em Configurações → Integrações (`provedorAssinatura` no model Escritorio).

## Fluxo atual

1. CRM: lead detail → botão "Enviar para assinatura"
2. POST `/api/leads/[id]/contrato/enviar` → gera PDF → envia ao provedor configurado (zapsign ou clicksign)
3. Provedor envia e-mail ao cliente com link de assinatura
4. Webhooks: `/api/webhooks/zapsign` ou `/api/webhooks/clicksign` → status `assinado` → converte lead em cliente
