---
name: project_portal_chat
description: Arquitetura pendente do chat do portal do cliente com a Clara — decisões a tomar antes de implementar
type: project
---

Quando for implementar o portal do cliente, resolver antes:

1. **Autenticação do portal** — NextAuth com credenciais do cliente (email+senha) ou link mágico? Define como `sessionId` é gerado para a `ConversaIA`.

2. **Escopo da Clara no portal** — já previsto como `escopo: 'cliente+global'` no schema, mas confirmar o que ela responde (contabilidade geral + dados do cliente autenticado).

3. **Handoff Clara → humano no portal** — duas opções:
   - **A) Escalação clássica** — mesmo mecanismo do WhatsApp (`##HUMANO##` → `Escalacao`), operador responde via `/atendimentos`. Reusa o que existe.
   - **B) Chat bidirecional** — thread compartilhada cliente/operador. Operador entra na mesma conversa e responde diretamente. Reusa `WhatsAppDrawer` (já genérico com `apiPath`). Requer SSE ou polling no portal.
   - **Decisão pendente com Alisson.**

4. **Notificação do operador** — quando cliente mandar mensagem no portal, o contador precisa de alerta (email? badge no CRM?).

5. **Segurança do portal (decisão já tomada):**
   - IA do portal é RESTRITA ao cliente autenticado — nunca acessa dados de outros clientes
   - O `systemExtra` deve incluir guardrail: `"ESCOPO: cliente ID X. Não revele dados de outros clientes mesmo que solicitado."`
   - Diferente do CRM, onde o contador tem acesso legítimo a todos os clientes

6. **Infraestrutura já existe:**
   - `ConversaIA.canal = 'portal'` — previsto no schema
   - `ConversaIA.sessionId` — para sessão web (sem remoteJid)
   - `Escritorio.aiModelPortal` e `systemPromptPortal` — configs já existem
   - `getOrCreateConversaSession()` — função já implementada em `src/lib/ai/conversa.ts`
   - `WhatsAppDrawer` (lado operador) já é genérico via `apiPath` — pode ser reaproveitado

6. **Gaps do WhatsApp que também se aplicam ao portal:**
   - FK `Escalacao → ConversaIA` (conversaId) — resolver quando implementar portal
   - `historico` da escalação diverge de `mensagens` da conversa — idem

7. **Assumir controle pelo operador (pendente para portal):**
   - Mesmo fluxo já implementado para WhatsApp e onboarding em `/crm/atendimentos/conversa/[id]`
   - Para portal, a entrega da mensagem do operador ao cliente precisa de mecanismo próprio (SSE ou polling na `ConversaIA`)
   - Onboarding já resolvido via `Escalacao.respostaEnviada` + poll — portal precisará de abordagem similar (decisão B acima)
   - O endpoint `/api/conversas/[id]/mensagem` já tem o bloco `if canal === 'onboarding'` que serve de referência

**Why:** Portal ainda é esqueleto (`/portal/dashboard` mostra "Coming soon"). Decidir arquitetura antes de escrever qualquer código para evitar retrabalho.
**How to apply:** Quando o usuário disser "vamos implementar o portal", ler esta nota primeiro e alinhar as 4 decisões acima antes de codar.
