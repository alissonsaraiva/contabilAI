---
name: Testes obrigatórios em toda mudança
description: Sempre adicionar testes unitários e de integração ao implementar features ou corrigir bugs
type: feedback
---

Toda feature nova ou correção de bug DEVE incluir testes unitários e/ou de integração cobrindo o código alterado.

**Why:** O projeto atingiu 206 testes (171 unitários + 35 integração) com CI/CD integrado ao deploy. Testes são a primeira barreira contra regressões — sem eles, bugs cruzados entre módulos voltam (histórico documentado no AGENTS.md Mapa de Módulos Críticos).

**How to apply:**
- **Lógica pura** (validação, formatação, parsing, cálculos) → teste unitário em `tests/unit/lib/`
- **Lógica com DB** (CRUD, queries, transições de estado) → teste de integração em `tests/integration/`
- **Bug fix** → escrever teste que reproduz o bug ANTES de corrigir (TDD do fix)
- Usar factories de `tests/helpers/factory.ts` para dados de integração
- Rodar `npm test` antes de considerar tarefa concluída (está no checklist pré-entrega do AGENTS.md)
