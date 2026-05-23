---
name: feedback_proxy_middleware
description: No ContabAI, usar apenas src/proxy.ts para lógica de middleware — nunca criar src/middleware.ts
type: feedback
---

Usar apenas `src/proxy.ts` para toda lógica de autenticação/redirecionamento no Next.js.

**Why:** Esta versão do Next.js não permite coexistência de `middleware.ts` e `proxy.ts` na mesma pasta — gera build error: "Both middleware file and proxy file are detected. Please use proxy.ts only."

**How to apply:** Nunca criar `src/middleware.ts`. Toda lógica que normalmente iria no middleware (auth, redirecionamentos, guards de rota) deve ficar em `src/proxy.ts`.
