---
name: feedback_onboarding_save
description: Todas as etapas do onboarding devem usar salvar-progresso (público), nunca PUT /api/leads/:id (exige auth)
type: feedback
---

No onboarding público, **nunca usar `PUT /api/leads/:id`** para salvar dados — esse endpoint exige sessão autenticada e retorna 401 silenciosamente (fetch não lança erro em 4xx).

**Endpoint correto:** `POST /api/onboarding/salvar-progresso` com `{ leadId, ...campos }`

**Afetados:** simulador, plano, dados, revisao — todos corrigidos em v2.5.6

**Why:** O bug fazia os dados não serem salvos no banco, incluindo `planoTipo` (lead ficava com status `iniciado` e plano null). O botão "Continuar" navegava mas os dados se perdiam.

**How to apply:** Qualquer nova etapa do onboarding que precise salvar dados deve usar `salvar-progresso`. O `PUT /api/leads/:id` é apenas para o CRM (autenticado).
