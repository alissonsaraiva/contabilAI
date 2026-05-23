---
name: Acesso à VPS para diagnóstico de bugs
description: Ao investigar bugs que dependem de dados reais (DB, logs, estado do container), acessar a VPS imediatamente em vez de ficar especulando pelo código
type: feedback
---

Ao se deparar com bugs que necessitam ver dados reais da produção — mensagens no banco, estado de conversas, logs do app, configuração da Evolution API, múltiplas conversas de um cliente — **acessar a VPS diretamente** para facilitar a análise.

**Why:** O bug do histórico WhatsApp demorou sessões para ser resolvido porque a investigação ficou restrita à leitura de código. A VPS mostrou em segundos que as mensagens estavam no banco e que havia múltiplas conversas com `criadaEm` diferentes para o mesmo cliente — a causa raiz do ordering bug. Sem a VPS, a análise circulou por race conditions, Nginx timeouts e SSE sem nunca encontrar o real culpado.

**How to apply:** Quando o bug envolver:
- Mensagens não aparecendo / dados sumindo
- Comportamento diferente entre sidebar e painel
- Estado de conversas, pausas, IDs
- Logs de erro em produção
- Qualquer hipótese que precise de dado real para confirmar ou descartar

→ Acessar VPS no começo da investigação, não no final. Referência: `memory/project_vps_access.md`.
