---
name: error-handling-patterns
description: Padrões de tratamento de erro do AVOS: try/catch/finally com Sentry, logs rastreáveis e refresh de UI. Usar ao escrever qualquer operação async crítica.
allowed-tools: Read, Grep
---

# Error Handling Patterns — AVOS

> Padrões específicos para este projeto. Zero tolerância a catch vazio.
> ESLint `no-empty` está como `error` — catch vazio **bloqueia o build**.

---

## Padrão 1 — Operação crítica server-side (API routes, lib/)

```ts
import * as Sentry from '@sentry/nextjs'

try {
  await operacaoCritica()
} catch (err) {
  console.error('[módulo] operacao falhou:', err)
  Sentry.captureException(err, {
    tags: { module: 'nome-do-modulo', operation: 'nome-da-operacao' },
    extra: { clienteId, empresaId }, // IDs relevantes para o contexto
  })
  throw err // ou return NextResponse.json({ error: '...' }, { status: 500 })
}
```

**Quando usar Sentry:** operações de escrita no banco, integraçõs externas (Evolution, Spedy, Resend, R2), crons, webhooks, tools de IA.

---

## Padrão 2 — Fetch com refresh de UI (componentes client-side)

```ts
// ERRADO — refresh só no try
async function enviar() {
  try {
    await fetch('/api/...')
    router.refresh() // ❌ não executa se fetch lançar erro
  } catch (err) {
    console.error('[componente] envio falhou:', err)
  }
}

// CORRETO — refresh no finally
async function enviar() {
  try {
    await fetch('/api/...')
  } catch (err) {
    console.error('[componente] envio falhou:', err)
    toast.error('Falha ao enviar. Tente novamente.')
  } finally {
    router.refresh() // ✅ sempre executa — UI sempre atualizada
    setLoading(false)
  }
}
```

**Regra:** qualquer `router.refresh()`, `carregar()`, `fetchNotas()`, `setLoading(false)` vai no `finally`.

---

## Padrão 3 — Fire-and-forget (não bloqueia o fluxo)

```ts
// ERRADO — promise solta (ESLint no-floating-promises como error)
load()
setInterval(load, 30_000)

// CORRETO
void load()
setInterval(() => void load(), 30_000)
```

---

## Padrão 4 — Fallback silencioso com log

Quando a operação pode falhar sem travar o fluxo principal (ex: RAG, analytics):

```ts
// ERRADO
const embeddings = await getEmbeddings(id).catch(() => null)

// CORRETO
const embeddings = await getEmbeddings(id).catch((err) => {
  console.error('[rag] getEmbeddings falhou:', err)
  return null
})
```

---

## Padrão 5 — Deleção com limpeza de embeddings (RAG)

```ts
// Ao deletar qualquer entidade indexada no RAG:
try {
  await prisma.cliente.delete({ where: { id } })
} catch (err) {
  console.error('[clientes] delete falhou:', err)
  Sentry.captureException(err, { tags: { module: 'clientes', operation: 'delete' } })
  throw err
}

// Separado — falha não deve bloquear a deleção principal
try {
  await deleteBySourceId(`cliente:${id}`)
} catch (err) {
  console.error('[rag] limpeza embeddings cliente falhou:', err)
  // Não re-throw — embeddings órfãos são problema secundário
}
```

---

## Padrão 6 — SSE streams (exceção documentada)

```ts
// ÚNICA exceção ao no-empty — controller pode estar fechado quando cliente desconecta
// eslint-disable-next-line no-empty -- controller já fechado se cliente desconectou
try { controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`)) } catch {}
```

---

## Padrão 7 — Acesso seguro a índices (noUncheckedIndexedAccess ativo)

```ts
// ERRADO — TypeScript 5.x com noUncheckedIndexedAccess lança erro de tipo
const char = str[0]          // ❌ string | undefined
const item = arr[0].prop     // ❌ pode ser undefined

// CORRETO
const char = str.charAt(0)   // ✅ sempre string
const char = str.at(0) ?? '' // ✅ com fallback
const item = arr[0]?.prop    // ✅ optional chaining
const item = arr.at(0)       // ✅ retorna T | undefined explícito
```

---

## Tags Sentry — convenção do projeto

```ts
Sentry.captureException(err, {
  tags: {
    module: 'whatsapp' | 'rag' | 'nfse' | 'email' | 'portal' | 'cron' | 'webhook' | 'ai-tools',
    operation: 'send' | 'delete' | 'sync' | 'emit' | 'process' | 'index',
  },
  extra: {
    // IDs que ajudam a rastrear o contexto:
    clienteId: string,
    empresaId: string,
    escritorioId: string,
    // outros relevantes ao contexto
  },
})
```

---

## Checklist ao escrever operação async

```markdown
- [ ] Toda operação crítica tem try/catch com console.error rastreável?
- [ ] Sentry.captureException nas operações que afetam dados ou integram externas?
- [ ] router.refresh() / carregar() / setLoading(false) está no finally?
- [ ] Promises soltas têm void?
- [ ] Acessos a índices de array têm guarda (.at(), .charAt(), optional chaining)?
- [ ] Catch de RAG deleteEmbeddings não re-throw (falha secundária)?
- [ ] SSE controller.enqueue tem o comentário eslint-disable-next-line documentado?
```
