---
name: feedback_proactive_checks
description: Alisson quer verificações proativas — ao corrigir um bug, sempre varrer o codebase em busca do mesmo padrão em outros lugares antes de encerrar
type: feedback
---

Ao corrigir qualquer bug, sempre fazer uma varredura proativa no codebase procurando o mesmo padrão em outros arquivos antes de considerar a tarefa encerrada.

**Why:** O bug `data.localidade` estava em dois lugares (onboarding/dados e configuracoes/contato). Alisson pediu que eu verificasse outros campos automaticamente — e encontrei o segundo caso. Não quer ser o responsável por lembrar de verificar: espera que eu faça isso por conta própria.

**How to apply:**
- Quando corrigir um campo errado em um consumer de API, usar Grep para achar todos os outros consumers do mesmo endpoint
- Quando corrigir um padrão de código (ex: `data.X` vs `data.Y`), buscar o mesmo anti-pattern em todo o `src/`
- Ao corrigir um bug estrutural (ex: endpoint retorna campo A mas consumer lê campo B), auditar todos os endpoints que fazem transformações de campo e verificar se seus consumers usam os nomes corretos
- Reportar o que foi encontrado E já corrigir — não só listar
