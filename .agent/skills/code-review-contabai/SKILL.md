---
name: code-review-contabai
description: Code review especializado para o projeto ContabAI/AVOS. Cobre anti-patterns do AGENTS.md, grupos críticos de módulos, regras TypeScript/Next.js específicas desta base de código. Use ao revisar PRs, implementações novas ou ao pedir "faça o code review".
allowed-tools: Read, Glob, Grep
---

# Code Review — ContabAI/AVOS

## Notação de severidade

```
🔴 BLOQUEANTE — não pode ir para produção
🟡 IMPORTANTE — deve corrigir antes do merge
🟢 COSMÉTICO — melhoria de qualidade, não bloqueia
❓ DÚVIDA — precisa de esclarecimento do autor
```

---

## Passo 1 — Ler os arquivos alterados

Antes de qualquer julgamento, ler todos os arquivos modificados na íntegra. Não revisar código que não foi lido.

---

## Passo 2 — Anti-patterns proibidos (AGENTS.md)

Verificar cada item. Se encontrado, é 🔴 BLOQUEANTE.

### 2.1 Catch vazio
```ts
// ❌ BLOQUEANTE
try { ... } catch {}
try { ... } catch (err) { console.log(err) }  // log sem Sentry em operação crítica

// ✅ Correto
try { ... } catch (err) {
  console.error('[modulo] operação falhou:', err)
  Sentry.captureException(err, { tags: { module: 'xxx', operation: 'yyy' }, extra: { id } })
}

// ✅ Exceção documentada — SSE streams (controller já fechado)
// eslint-disable-next-line no-empty -- controller já fechado se cliente desconectou
try { controller.enqueue(...) } catch {}
```

Verificar: toda operação crítica (DB, Evolution API, RAG, NFS-e, envio de e-mail) tem Sentry com `tags: { module, operation }` + extra com IDs relevantes?

### 2.2 Promise solta (`@typescript-eslint/no-floating-promises` = error)
```ts
// ❌ BLOQUEANTE
load()
setInterval(load, 30_000)
router.push('/path')  // em alguns contextos

// ✅ Correto
void load()
setInterval(() => void load(), 30_000)
void router.push('/path')
```

### 2.3 Indexação sem guarda (`noUncheckedIndexedAccess` ativo)
```ts
// ❌ BLOQUEANTE
const first = array[0].nome        // array[0] pode ser undefined
const char  = str[i]               // str[i] pode ser undefined

// ✅ Correto
const first = array.at(0)?.nome
const char  = str.charAt(i)
// ou: type assertion com evidência de que índice existe
const first = array[0]!.nome  // só com evidência (ex: length check acima)
```

### 2.4 `middleware.ts` — NUNCA tocar
```
❌ BLOQUEANTE: src/middleware.ts criado ou modificado
✅ Usar apenas: src/proxy.ts
```
Coexistência de `middleware.ts` com `proxy.ts` causa build error nesta versão do Next.js.

### 2.5 Nomes hardcoded
```ts
// ❌ BLOQUEANTE em UI visível
<p>AVOS Contabilidade</p>
<p>ContabAI</p>

// ✅ Correto
const config = await getEscritorioConfig()
<p>{config.nomeFantasia}</p>
```

### 2.6 Onboarding via PUT
```ts
// ❌ BLOQUEANTE (exige auth, quebra fluxo público)
PUT /api/leads/:id

// ✅ Correto para etapas públicas
POST /api/onboarding/salvar-progresso
```

### 2.7 Tool de IA sem avaliação
Antes de criar nova tool de agente, verificar:
- Frequência de uso esperada
- Criticidade (pode ter efeito colateral irreversível?)
- Volume (muitas chamadas = custo elevado de créditos)
- Deveria ser feature fixa em vez de tool?

Se não há evidência dessas avaliações: 🟡 IMPORTANTE.

---

## Passo 3 — Módulos críticos (verificar grupos afetados)

Ao alterar qualquer arquivo dos grupos abaixo, verificar obrigatoriamente os outros do mesmo grupo.

### Grupo 1 — Chat WhatsApp
**Arquivos:** `conversa-rodape.tsx`, `use-whatsapp-chat.ts`, `pipeline/*`, `clientes/[id]/whatsapp/route.ts`, `socios/[id]/whatsapp/route.ts`

- 🔴 Ação de refresh/reload de UI após envio está no `finally`? (nunca só no `try`)
- 🔴 Rotas GET e POST de WhatsApp usam o mesmo critério para `conversaAtual` (`orderBy: atualizadaEm desc`)?

### Grupo 2 — Chat Portal / SSE
**Arquivos:** `portal-conversa-panel.tsx`, `portal-clara.tsx`, `stream/conversas/[id]/route.ts`, `stream/portal/conversa/route.ts`, `portal/chat/route.ts`, `crm/ai/chat/route.ts`

- 🔴 Condições SSE testam `data.conteudo` como boolean? (`if (data.conteudo)` falha para arquivos com `conteudo = ''`)
- 🔴 Tipos de mensagem incluem campos de mídia? (`mediaUrl`, `mediaType`, `mediaFileName`)
- 🟡 Mudança na estrutura do payload SSE? → verificar todos os consumidores (`new EventSource(...)`)
- 🔴 `fetch` de envio tem refresh no `finally`?

### Grupo 3 — NFS-e
**Arquivos:** `notas-fiscais-tab.tsx`, `crm/notas-fiscais/route.ts`, `portal/notas-fiscais/route.ts`, tools de NFS-e

- 🔴 Nova ação de NFS-e tem estrutura simétrica try/catch/finally igual às existentes?
- 🔴 `fetchNotas(true)` (ou equivalente) está no `finally` de todas as ações?

### Grupo 4 — RAG CRUD
**Arquivos:** `rag/store.ts`, qualquer rota DELETE, tools que criam/deletam entidades

- 🔴 Deleção de entidade com embeddings chama `deleteEmbeddings()` ou `deleteBySourceId()`?
- 🔴 Esse `deleteEmbeddings` tem try/catch com log? (falha silenciosa = dados órfãos no pgvector)

### Grupo 5 — SSE Streams
**Arquivos:** `stream/escalacoes/[id]/route.ts`, `stream/conversas/[id]/route.ts`, `stream/portal/conversa/route.ts`

- 🟢 Catch vazio em `controller.enqueue/close` tem comentário explicativo?
- 🟡 Campo novo no payload SSE → todos os consumidores validam presença antes de usar?

### Grupo 6 — WhatsApp remoteJid
**Arquivos:** delete de mensagem, `evolution.ts`, qualquer código com `remoteJid`

- 🔴 Operação em mensagem específica (delete, reply, react) usa `waKey.remoteJid`, não `conversa.remoteJid`?
- Contexto: conversa armazena `5585981186338` (9 dígitos), key pode ter `558581186338` (8 dígitos). Evolution API aceita JID errado silenciosamente.

---

## Passo 4 — TypeScript / Next.js App Router

### 4.1 `searchParams` e `params` são Promises nesta versão
```ts
// ❌ BLOQUEANTE — API antiga, quebra em produção
export default function Page({ params }: { params: { id: string } }) {
  const { id } = params

// ✅ Correto
type Props = { params: Promise<{ id: string }> }
export default async function Page({ params }: Props) {
  const { id } = await params
```

### 4.2 `any` explícito
```ts
// 🟡 IMPORTANTE
const data: any = ...
const user = session?.user as any  // aceitável só em session (limitação do next-auth)
```

### 4.3 Server Components vs Client Components
- 🟡 `useState`/`useEffect` em Server Component?
- 🟡 `async/await` diretamente em Client Component (`'use client'`)?
- 🟡 Prop de Server → Client Component contém objetos não serializáveis (Date, função)?

### 4.4 Prisma
- 🔴 `prisma db push` em schema? → NUNCA. Usar `prisma migrate dev --name <nome>`
- 🟡 Query com N+1 potencial? (loop com `findUnique` dentro)
- 🟢 `select` desnecessariamente amplo quando poucos campos são usados?

---

## Passo 5 — Segurança

- 🔴 Rota de API sem verificação de `auth()`?
- 🔴 Dado de entrada do usuário passado diretamente para query sem sanitização?
- 🔴 Segredo ou credencial hardcodada no código?
- 🔴 Rota que opera em resource de outro escritório sem verificar `escritorioId`?
- 🟡 Rota pública expõe dados que deveriam ser privados?

---

## Passo 6 — Qualidade geral

### Finally blocks
- 🟡 Operação com loading state: o `setLoading(false)` está no `finally`?
- 🟡 Operação com refresh após ação: o refresh está no `finally`?

### Hoisting e ordenação
- 🟢 `useEffect` chamando funções declaradas depois (hoisting implícito)? → mover effect para após a função ou usar `useCallback`

### Código sem propósito
- 🟢 Feature não solicitada adicionada?
- 🟢 Refactor não pedido?
- 🟢 Comentário ou `console.log` de debug esquecido?

### Documentação
- 🟡 Módulo alterado tem arquivo correspondente em `docs/`? Se sim, foi atualizado?

---

## Passo 7 — Checklist pré-entrega (verificar evidências)

O autor rodou:
- [ ] `npx tsc --noEmit` — sem erros?
- [ ] `npm run build` — sem falhas?

Se houver schema Prisma alterado:
- [ ] Migration gerada com `prisma migrate dev --name <nome>`?
- [ ] Arquivo SQL commitado em `prisma/migrations/`?

Se for deploy:
- [ ] Tag `v*` criada? (push para main sozinho não dispara CI)

---

## Formato de saída

Organizar o review por arquivo, depois por severidade:

```
### src/caminho/do/arquivo.ts

🔴 BLOQUEANTE — [linha X]: catch vazio em operação crítica
   Adicionar Sentry.captureException com tags { module: 'xxx', operation: 'yyy' }

🟡 IMPORTANTE — [linha Y]: Promise solta
   `load()` → `void load()`

🟢 COSMÉTICO — [linha Z]: AND desnecessariamente verboso
   `AND: [{ OR: [...] }]` → `AND: { OR: [...] }`
```

Se não há problemas em um arquivo: `✅ [arquivo] — sem problemas encontrados`

Ao final, resumo com contagem: `X 🔴 | Y 🟡 | Z 🟢`
