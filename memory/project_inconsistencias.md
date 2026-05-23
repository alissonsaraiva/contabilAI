---
name: Inconsistências e Débito Técnico — Auditoria 2026-04-02
description: Inconsistências identificadas na auditoria completa do código em 2026-04-02 (v3.10.7)
type: project
---

## Inconsistências Encontradas (auditoria 2026-04-02)

### Código
1. **Typo na tool**: `atudalizarDadosCliente` (deveria ser `atualizarDadosCliente`) — presente em `src/lib/ai/tools/`
2. **`src/middleware.ts`**: arquivo existe mas está descontinuado e não deve ser tocado — causa build error
3. **Webhook WhatsApp sem auth**: `/api/whatsapp/webhook` não valida autenticidade do payload da Evolution API
4. **Lock WhatsApp sem timeout**: `processandoEm` nunca expira — conversa pode travar se instância cair mid-processing
5. **Webhook Spedy sem retry**: NFS-e pode ficar em `enviando` indefinidamente se webhook falhar

### Documentação Desatualizada
6. **`docs/ia-arquitetura.md`**: ainda referencia arquitetura antiga (não reflete 38 tools, 4 canais, RAG v3.5)
7. **`project_proximos_passos.md`**: NFS-e estava listada como futura mas já estava implementada
8. **`project_agente_operacional.md`**: listava `criarTarefa/listarTarefas/concluirTarefa` que foram removidas

### .env.example
9. **`ZAPI_*`**: variáveis de Z-API no template mas código usa `EVOLUTION_*`
10. **`VAPIR_PRIVATE_KEY`**: typo (deveria ser `VAPID_PRIVATE_KEY`)
11. **`package.json`**: ainda mostra versão `0.1.0` (não reflete v3.10.7)

### Schema / API
12. **`/api/escalacoes/pendentes-count`**: endpoint legacy duplicado de `/api/escalacoes/contagem`
13. **Endpoint `/api/clientes/[id]/whatsapp`**: existe em CRM mas pode conflitar com `/api/crm/clientes/[id]/portal-chat`

## How to apply
Antes de implementar qualquer feature que envolva esses pontos, verificar se o problema foi corrigido.
Ao corrigir o typo `atudalizarDadosCliente`, varrer TODOS os arquivos que referenciam o nome.
