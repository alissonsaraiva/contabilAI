---
name: avos-pre-implementacao
description: Protocolo obrigatório pré-implementação do AVOS. Usar ANTES de qualquer feature, bug fix ou refactor — não começar a codar sem passar por este protocolo.
allowed-tools: Read, Glob, Grep
---

# AVOS — Protocolo Pré-Implementação

> **OBRIGATÓRIO** antes de qualquer implementação (feature, bug fix, refactor).
> Não começar a codar sem completar cada etapa.

---

## Passo 1 — Reescrever o problema

Reescrever o problema com as próprias palavras. Objetivo: confirmar entendimento antes de agir.

```
Problema identificado: [descrever em 1-3 frases o que precisa ser resolvido]
Contexto: [onde acontece, quem é afetado, quando foi reportado]
```

---

## Passo 2 — Levantar dúvidas, ambiguidades e riscos

Antes de propor solução, listar tudo que não está claro:

```markdown
## Dúvidas
- [ ] [Pergunta 1 — parar e perguntar se não souber]
- [ ] [Pergunta 2]

## Ambiguidades
- [ ] [O comportamento esperado em edge case X não está definido]

## Riscos
- [ ] [Este módulo pertence ao Grupo N do mapa de módulos críticos?]
- [ ] [A mudança pode afetar outros arquivos do mesmo grupo?]
- [ ] [Requer migração de banco? (criar migrate dev, não db push)]
- [ ] [Afeta RAG? (nova entidade, deleção, atualização de embeddings)]
- [ ] [Afeta crons? (healthchecks.io + crontab VPS)]
```

> Se faltar informação, **parar e perguntar**. Nunca assumir requisito.

---

## Passo 3 — Definir comportamento esperado

```markdown
## Entradas
- Input: [o que chega — parâmetros, props, payload]

## Saídas
- Sucesso: [o que acontece quando funciona]
- Erro: [o que acontece quando falha — UI, log, Sentry]

## Estados intermediários
- [Loading, empty, error states se aplicável]
```

---

## Passo 4 — Consultar catálogo de bugs conhecidos

**Obrigatório:** abrir `memory/known_issues_patterns.md` e verificar se o problema tem padrão já catalogado.

Se o arquivo não estiver disponível, verificar se o bug se encaixa nos anti-patterns do AGENTS.md:
1. Catch vazio (sem log + sem Sentry)
2. Refresh/reload só no `try` (deveria estar no `finally`)
3. Mismatch entre GET e POST no mesmo recurso
4. Deleção sem limpar embeddings RAG
5. Promise solta (sem `void`)
6. Acesso a índice de array sem guarda (`array[i]` → `array.at(i)`)

---

## Passo 5 — Propor abordagem técnica

```markdown
## Abordagem proposta
[Descrever a solução em termos técnicos: quais arquivos serão alterados, qual lógica será implementada]

## Arquivos afetados
- [arquivo1.ts — motivo]
- [arquivo2.tsx — motivo]

## Arquivos do mapa de módulos críticos afetados?
- [ ] Grupo 1 (WhatsApp chat)
- [ ] Grupo 2 (Portal chat / SSE)
- [ ] Grupo 3 (NFS-e)
- [ ] Grupo 4 (RAG CRUD)
- [ ] Grupo 5 (SSE streams)

## Alternativas descartadas
- [Alternativa X — descartada porque Y]
```

---

## Passo 6 — Pedir autorização explícita

**Apresentar o plano completo ao usuário e aguardar "pode implementar" explícito antes de escrever qualquer código.**

Formato da resposta:
```
Entendimento: [resumo do problema]
Abordagem: [resumo da solução]
Arquivos: [lista]
Riscos: [lista ou "nenhum identificado"]

Posso implementar?
```

---

## Anti-patterns proibidos (checar antes de codar)

| Anti-pattern | O que fazer em vez disso |
|---|---|
| `catch {}` vazio | `catch (err) { console.error('[módulo] operação:', err); Sentry.captureException(err, ...) }` |
| Refresh só no `try` | Mover para `finally` |
| `prisma db push` | `prisma migrate dev --name <nome_descritivo>` |
| `src/middleware.ts` | Só `src/proxy.ts` |
| Hardcodar "AVOS" / "ContabAI" | `getEscritorioConfig()` |
| Promise solta `fn()` | `void fn()` ou `setInterval(() => void fn(), ms)` |
| `array[i]` sem guarda | `array.at(i)` ou `array[i]?.prop` ou `.charAt(i)` |
| Tool de IA sem avaliação | Avaliar frequência, criticidade, custo de créditos antes de criar |
| Onboarding via PUT | `POST /api/onboarding/salvar-progresso` |
