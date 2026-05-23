---
name: feedback_onboarding_chat_context
description: O que fica no código vs no CRM para o chat de onboarding — regra de separação e comportamento do widget
type: feedback
---

No chat de onboarding (`src/app/api/onboarding/chat/route.ts`), o contexto da IA é dividido em duas camadas:

**Fica no CRM (editável sem deploy):**
- System prompt completo: personalidade, tom, regras de atendimento, etapas do fluxo de cadastro
- Configurado em: CRM → Configurações → IA → Prompts → Onboarding

**Fica no código (injetado como `systemExtra` por request):**
- Dados dinâmicos do lead buscados do banco: nome, plano selecionado, regime tributário, cidade, status no fluxo
- Plano também enviado pelo widget via `?plano=` da URL como fallback quando `planoTipo` está null no banco
- Esses dados mudam por lead/request, então não podem ficar no prompt estático

**Why:** O Alisson quer poder editar o fluxo de etapas e regras de atendimento sem precisar de deploy. Qualquer conteúdo que seja "decisão de produto" vai pro CRM; qualquer conteúdo que seja "dado técnico/dinâmico" fica no código.

**How to apply:** Se o Alisson pedir pra adicionar algo ao contexto do chat de onboarding, perguntar antes: "isso muda com frequência ou é estático?" — se muda, vai no prompt do CRM; se é dado do sistema/banco, vai no código como `systemExtra`.

## Comportamento do chat widget (onboarding)

- **Sem chunk splitting**: resposta exibida em mensagem única com `stripMarkdown` — listas e tabelas ficam legíveis
- O chunk splitting (múltiplas bolhas com delay) é **exclusivo do WhatsApp** (`src/lib/whatsapp/human-like.ts`)
- Portal e CRM também exibem resposta única (nunca tiveram splitting)

**Why:** O splitting transformava cada item de lista em uma bolha separada, parecendo quebrado no widget web. No WhatsApp faz sentido pois são mensagens reais separadas.
