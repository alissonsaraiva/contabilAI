---
name: tarefas_module_removed
description: O módulo de tarefas foi deletado pelo usuário — não existe mais no codebase
type: project
---

O módulo de tarefas (`Tarefa` model no Prisma, rotas `/api/tarefas`, componentes de tarefas) foi **completamente removido** pelo usuário.

**Why:** Decisão do produto — o módulo foi apagado intencionalmente.

**How to apply:** Não referenciar `prisma.tarefa`, não criar rotas de tarefas, não incluir tarefas em queries. Se alguma tela ainda mencionar tarefas, remover a referência. O seed.ts já foi atualizado para não criar tarefas.
