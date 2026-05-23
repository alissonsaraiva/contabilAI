---
name: Documentação como fonte de verdade — protocolo obrigatório
description: Regra permanente: pasta docs/ (SISTEMA.md + features/ + WHATSAPP.md + ia-arquitetura.md) é a fonte de verdade. Ler e atualizar o arquivo correspondente em toda alteração.
type: feedback
---

A documentação do projeto está em `docs/` com estrutura modular e deve ser mantida sempre sincronizada com o código.

## Estrutura atual de docs/

- `docs/SISTEMA.md` — visão geral do sistema, arquitetura, versão, stack
- `docs/WHATSAPP.md` — pipeline, fluxos, integrações de WhatsApp
- `docs/ia-arquitetura.md` — arquitetura das IAs, providers, RAG, agente
- `docs/features/` — uma doc por feature (ex: `SAUDE.md`, `NFSE.md`, etc.)

## Protocolo antes de codificar (OBRIGATÓRIO)

1. Identificar qual(is) doc(s) de `docs/` são relevantes para a tarefa
2. Ler os arquivos correspondentes
3. Verificar: a feature já está coberta? Há impacto em fluxos existentes?
4. Se NÃO estiver documentada → planejar atualização junto com a implementação

## Protocolo após implementar (OBRIGATÓRIO)

Atualizar **imediatamente** o(s) arquivo(s) de doc correspondente(s):
- Novos fluxos ou mudanças de comportamento → arquivo da feature em `docs/features/`
- Mudanças em WhatsApp → `docs/WHATSAPP.md`
- Mudanças em IA/RAG/agente → `docs/ia-arquitetura.md`
- Mudanças gerais de arquitetura/stack → `docs/SISTEMA.md`
- Nova feature → criar `docs/features/<NOME>.md`

Atualizar também os arquivos de memória relevantes (`memory/*.md`) para que próximas conversas herdem o contexto.

## Regras críticas

- Documentação desatualizada = erro
- Nunca adicionar feature sem atualizar a doc correspondente
- Nunca confiar em comportamento não documentado
- A doc deve ser suficiente para um dev entender o sistema sem ler todo o código

**Why:** O projeto cresceu rápido e a documentação ficou desatualizada várias vezes, causando retrabalho e inconsistências. A estrutura modular de docs/ foi adotada em v3.10.22 para facilitar manutenção. Regra estabelecida em 2026-04-02, reforçada em 2026-04-04.

**How to apply:** Em todo início de tarefa: identificar e ler os docs relevantes em `docs/`. Em todo fim de tarefa: atualizar o(s) arquivo(s) correspondente(s). Se a tarefa for grande, atualizar por seção à medida que cada parte é implementada.
