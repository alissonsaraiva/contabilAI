---
name: Rigor no Diagnóstico e Resolução de Problemas
description: Regras permanentes para diagnóstico profundo, evitar alucinação e proibir soluções superficiais
type: feedback
---

# Rigor no Diagnóstico e Resolução de Problemas

**Regra central**: nunca propor ou implementar solução sem identificar a causa raiz real do problema.

## 1. Proibição de Alucinação

- Não aceitar suposições como base para solução
- Se o comportamento não estiver claramente identificado via evidências (logs, código, dados), NÃO inventar solução
- Sempre identificar a **causa raiz** antes de qualquer proposta
- Se necessário, conduzir debug detalhado antes de agir

**Why:** Soluções inventadas consertam o sintoma mas deixam o problema real intacto — e muitas vezes criam novos bugs.

**How to apply:** Antes de qualquer proposta, declarar explicitamente "a causa raiz identificada é X" com evidência concreta. Se não há evidência, dizer isso e pedir mais dados.

---

## 2. Diagnóstico Profundo Obrigatório

- Ao identificar um problema, investigar **todos os cenários possíveis**, não só o mais óbvio
- Verificar: logs, fluxos de dados, chamadas de API, estados de erro, contexto histórico
- Considerar: código atual, versões anteriores, usuários impactados, edge cases

**Why:** Focar no cenário óbvio leva a correções parciais que não eliminam o problema.

**How to apply:** Listar todos os pontos de falha possíveis antes de escolher qual investigar primeiro.

---

## 3. Proibição de Soluções Superficiais ("Quick Fixes")

- Proibido resolver de forma rápida apenas para "satisfazer" — isso mascara o problema real
- Soluções devem ser robustas, com tratamento de erros e edge cases
- Validar a solução contra o problema real identificado — nunca "apagar sintomas"
- Exemplos proibidos: mais logs sem análise, ajustes temporários sem revisar causa, try/catch vazio

**Why:** Soluções paliativas criam débito técnico silencioso e falham em produção de forma imprevisível.

**How to apply:** Se a única solução disponível no momento for paliativa, documentar explicitamente o que foi feito, por que é temporário, e abrir item no backlog com a solução definitiva.

---

## 4. Codificação com Propósito

- Não escrever código para "agradar" sem análise completa da necessidade real
- Evitar funcionalidades não solicitadas ou que não resolvem problema real
- Lógica de desenvolvimento orientada à **eficácia e escalabilidade**, não à aparência

**Why:** Código desnecessário aumenta complexidade, superfície de ataque e custo de manutenção.

**How to apply:** Antes de codar qualquer coisa, confirmar: "isso resolve diretamente o problema identificado?"

---

## 5. Documentação de Causa Raiz

- Registrar sempre: causa raiz identificada + solução adotada + evidências
- Não documentar apenas "como a feature foi implementada" — documentar "por que o problema ocorreu e como foi resolvido"
- Se solução for paliativa: documentar explicitamente com prazo/condição para correção definitiva

**Why:** Sem documentação de causa raiz, o mesmo bug reaparece e não há histórico para diagnóstico.

**How to apply:** Commits e docs devem sempre incluir "causa: X / solução: Y" não apenas "fix: Z".

---

## 6. Foco no Impacto Real

- Resolução focada no **impacto real** em produção, experiência do usuário e integridade do sistema
- Evitar mudanças que não trazem valor substancial ou que adicionam complexidade sem ganho real

**Why:** Mudanças sem impacto real consomem tempo e introduzem risco desnecessário.

**How to apply:** Sempre perguntar "qual é o impacto mensurável desta mudança para o usuário final?"

---

## Regras Críticas (resumo)

1. Nunca deixar problema sem causa real identificada
2. Não inventar soluções para problemas não completamente diagnosticados
3. Proibido "quick fix" para agradar — resolver a raiz ou documentar o gap
4. Documentar causa raiz e solução real de forma clara e acessível
