---
name: feedback_docs_memory_update
description: Regra permanente — atualizar docs/ (modular) e memória sempre que houver alterações de código, configuração ou infra
type: feedback
---

Após qualquer alteração de código, configuração ou infra, atualizar **imediatamente**:

1. O arquivo de doc correspondente em `docs/` — estrutura modular:
   - `docs/SISTEMA.md` — arquitetura geral, stack, versão
   - `docs/WHATSAPP.md` — pipeline e fluxos de WhatsApp
   - `docs/ia-arquitetura.md` — IA, RAG, agente, providers
   - `docs/features/<NOME>.md` — uma doc por feature (criar se não existir)
2. Arquivos de memória relevantes (`project_vps_infra.md`, `project_agente_operacional.md`, etc.)
3. `MEMORY.md` — se o índice precisar de atualização

**Why:** O usuário corrigiu explicitamente após sessões onde código foi alterado sem atualizar a documentação. Docs desatualizadas levam a retrabalho e decisões erradas. Em 2026-04-04 o usuário reforçou que a pasta `docs/` tem múltiplos arquivos e TODOS devem ser mantidos sincronizados.

**How to apply:** Ao final de qualquer sessão com mudanças — mesmo que o usuário não peça — identificar qual(is) arquivo(s) de `docs/` foram afetados e atualizar. Nunca deixar para depois.
