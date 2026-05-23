---
name: feedback_agent_tool_vs_feature
description: Quando sugerir tool de agente vs feature fixa no código — orientar Alisson sempre que ele pedir uma nova tool ou funcionalidade do agente
type: feedback
---

Sempre que Alisson pedir uma nova tool de agente ou funcionalidade nova, avaliar antes de implementar:

**Faça como tool de agente se:**
- A ação é ad-hoc ou composta (combina dados de lugares diferentes de forma variável)
- Cada usuário faria de um jeito diferente, ou com frequência irregular
- Seria difícil ou demorado criar uma UI específica para aquilo
- O caso de uso principal é agendamento customizado ("toda segunda me manda X")
- É o espaço *entre* as features existentes

**Faça como feature fixa se:**
- O usuário vai fazer aquilo todo dia, ou é fluxo de rotina previsível
- É uma ação crítica (cancelar contrato, emitir NF, alterar valor) — validações explícitas são mais seguras
- Volume esperado é alto (centenas de chamadas/dia) — custo de LLM escala
- Existe UI natural para aquilo (tabela com filtros, formulário, dashboard)

**Regra de ouro:** se um usuário vai fazer aquilo todo dia → vira feature. Se vai fazer uma vez por mês de um jeito diferente cada vez → é do agente.

**Why:** Alisson quer evitar custo desnecessário de créditos de IA e também não quer ficar implementando features para cada variação de consulta/ação. A estratégia híbrida é o equilíbrio: agente cobre o espaço entre as features, não as substitui.

**How to apply:** Quando Alisson pedir "quero uma tool pra X" ou "quero que o agente faça Y", antes de implementar, classificar o pedido nas categorias acima e dar uma recomendação explícita (tool vs feature vs híbrido), com breve justificativa de custo/benefício. Só implementar depois da validação.

**Referência de custo (Claude Sonnet):** ~$0.002–0.005 por execução típica do agente. 50 chamadas/dia ≈ $3–7/mês. Risco de custo explode em agendamentos com muitas tool calls ou loops.
