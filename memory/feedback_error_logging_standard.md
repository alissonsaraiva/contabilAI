---
name: feedback_error_logging_standard
description: REGRA PERMANENTE — tratamento de erro explícito + logs rastreáveis em TODO código gerado neste projeto
type: feedback
---

Regra permanente definida explicitamente pelo Alisson. Aplica-se a todo código gerado ou modificado, sem exceção.

**Premissas de produção (imutáveis):**
- Este código roda em produção com alto volume
- Qualquer erro pode virar incidente
- Sentry está configurado — erros não capturados e exceções são enviados automaticamente
- Os logs do container + Sentry são as fontes de diagnóstico em produção

**Why:** Zero falhas silenciosas. Um operador precisa conseguir reconstruir completamente o que aconteceu **apenas lendo os logs** — sem acessar o código, sem reproduzir localmente.

**How to apply:** Revisar o código gerado antes de finalizar. Se encontrar catch vazio, ausência de log ou integração sem tratamento, corrigir automaticamente antes de entregar. Em caso de dúvida, logar mais — nunca menos.

---

## 1. Tratamento de erros

- Nunca deixar operações críticas sem `try/catch` ou equivalente (`.catch()`)
- Nunca engolir erros silenciosamente — `catch {}` vazio é **proibido**
- Sempre capturar com variável: `catch (err: unknown)` → `err instanceof Error ? err.message : String(err)`
- Propagar erros quando necessário, mas sempre com informação útil adicionada
- Fire-and-forget aceito para operações secundárias, mas **sempre** com `.catch((err) => console.error(...))`

## 2. Logs obrigatórios

- Logar **início** de fluxos importantes (entrada na função, parâmetros recebidos)
- Logar **saídas importantes** (resultado, status, IDs gerados)
- Logar **erros** com: mensagem + stack/contexto + identificadores relevantes
- Em integrações externas: logar o que foi enviado, o que foi recebido, erros e timeouts

## 3. Contexto obrigatório nos logs

Sempre incluir identificadores que permitam rastrear o problema:

```typescript
console.error('[modulo/funcao] descrição do erro:', {
  clienteId,
  conversaId,
  documentoId,
  // qualquer id relevante para o contexto
  err,
})
```

Nunca usar logs genéricos sem contexto:
- ❌ `console.error('erro ao processar')`
- ✅ `console.error('[webhook] erro ao processar mensagem:', { remoteJid, conversaId, err })`

## 4. Integrações externas (Evolution API, S3, Asaas, IA providers, etc.)

Para toda chamada externa:
- Logar o que foi enviado (sem dados sensíveis como tokens/senhas)
- Logar a resposta recebida (status, resultado resumido)
- Logar erros e timeouts com contexto da operação
- Sempre tratar falhas explicitamente — nunca assumir que vai funcionar

## 5. Auditabilidade

Um operador deve conseguir reconstruir completamente o que aconteceu em produção **apenas pelos logs**, sem precisar ler o código.

## Proibições absolutas

- `catch {}` — sem variável, sem log
- `catch (err) { /* ignora */ }` — sem log
- `.catch(() => {})` — sem log
- Falhas silenciosas em qualquer fluxo crítico
- Ausência de logs em integrações externas
- Logs sem contexto (sem ids, sem parâmetros relevantes)

## Padrão de código correto

```typescript
// Fluxo principal com try/catch
try {
  console.log('[modulo/funcao] iniciando operação:', { entidadeId, parametro })
  const resultado = await operacaoCritica({ ... })
  console.log('[modulo/funcao] operação concluída:', { entidadeId, resultado })
  return resultado
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  console.error('[modulo/funcao] falha na operação:', { entidadeId, parametro, erro: msg })
  throw err // propaga se necessário
}

// Fire-and-forget aceitável (operações secundárias)
operacaoSecundaria(id)
  .catch((err: unknown) =>
    console.error('[modulo/funcao] erro em operação secundária:', { id, err }),
  )
```
