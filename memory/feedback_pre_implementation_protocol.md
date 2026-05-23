---
name: Pre-implementation analysis protocol
description: Before writing any code, always go through a structured clarification phase — never implement directly from a vague request
type: feedback
---

Antes de qualquer implementação, sempre executar este protocolo:

1. **Reescrever o problema** com as próprias palavras
2. **Levantar dúvidas e ambiguidades** — listar o que não está claro, suposições implícitas, conflitos
3. **Identificar riscos** — falhas possíveis, edge cases, dependências externas
4. **Definir comportamento esperado** — inputs/outputs, casos de sucesso, casos de erro, critérios de aceitação
5. **Propor abordagem** — descrever a solução antes de codar, decisões técnicas, alternativas
6. **Pedir autorização explícita** para prosseguir para a implementação

**Why:** Evitar retrabalho por suposições erradas e código gerado sem clareza de requisitos.

**How to apply:** Sempre que o usuário pedir uma nova feature, bug fix não trivial, ou qualquer tarefa de implementação — parar, analisar, e só então perguntar se pode implementar. Nunca inventar requisitos. Se faltar informação, parar e pedir esclarecimento.

Regras adicionais explicitadas:
- Nunca começar pelo código
- Nunca deixar erro sem log
- Nunca confiar sem revisar
- Nunca assumir requisito
- Sempre pensar em produção
