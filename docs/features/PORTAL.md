# PORTAL — Portal do Cliente

> **Sistema:** AVOS v3.10.27 | **Fonte:** `SISTEMA.md` (extraído)

---

## Autenticação

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/portal/magic-link` | POST | Enviar magic link por email |
| `/api/portal/otp/whatsapp` | POST | Enviar OTP via WhatsApp |
| `/api/portal/otp/verificar` | POST | Validar OTP |
| `/api/portal/logout` | POST | Revogar sessão |

**Mecanismos**: magic link por e-mail + OTP via WhatsApp  
**Token**: hash SHA-256 com expiração de 30 min (magic link) / 10 min (OTP)  
**Sessão**: JWT httpOnly cookie `PORTAL_COOKIE_NAME`, maxAge 30 dias

### Segurança do Magic Link (corrigido 2026-04-04)

| Proteção | Implementação |
|----------|----------------|
| Rate limit | 5 req/IP/10min — retorna 429 com `Retry-After: 600` |
| Enumeração de emails | Resposta genérica `email_nao_cadastrado` (sem revelar existência) |
| Token consumido após sessão | `usedAt` salvo só após `encode()` ter sucesso — magic link não é queimado se JWT falhar |
| Token one-time | `usedAt != null` invalida qualquer re-uso |

## Rotas do Portal

| Rota | Auth | Descrição |
|------|------|-----------|
| `/api/portal/financeiro/cobrancas` | Portal session | Listar cobranças |
| `/api/portal/financeiro/segunda-via` | Portal session | Segunda via |
| `/api/portal/financeiro/vencimento` | Portal session | Alterar dia vencimento (PATCH) |
| `/api/portal/financeiro/forma-pagamento` | Portal session | Alterar forma PIX/boleto (PATCH) |
| `/api/portal/financeiro/extrato` | Portal session | Exportar CSV (GET) |
| `/api/portal/documentos` | Portal session | Listar/upload documentos |
| `/api/portal/documentos/[id]/download` | Portal session | Download com URL assinada R2 |
| `/api/portal/notas-fiscais` | Portal session | Listar NFS-e (GET) / Emitir nova NFS-e (POST) |
| `/api/portal/notas-fiscais/[id]` | Portal session | Detalhe da nota |
| `/api/portal/notas-fiscais/[id]/cancelar` | Portal session | Cancelar nota autorizada |
| `/api/portal/notas-fiscais/[id]/reemitir` | Portal session | Reemitir nota rejeitada/erro |
| `/api/portal/notas-fiscais/[id]/pdf` | Portal session | Download PDF |
| `/api/portal/notas-fiscais/[id]/xml` | Portal session | Download XML |
| `/api/portal/chamados` | Portal session | Listar/criar chamados |
| `/api/portal/chat` | Portal session | Clara (IA) |
| `/api/portal/push/subscribe` | Portal session | Registrar web push |
| `/api/portal/financeiro/das-mei` | Portal session | DAS MEI do cliente (only MEI) |
| `/api/portal/financeiro/limite-mei` | Portal session | Faturamento acumulado via NFS-e + percentual do limite (only MEI) |
| `/api/portal/procuracao-rf` GET | Portal session | Status procuração RF (`{ regime, procuracaoRFAtiva, verificadaEm }`) |
| `/api/portal/procuracao-rf` POST | Portal session | Verificação imediata via SERPRO (throttle 10 min); degrada se módulo não contratado |

## Dashboard do Portal (v3.10.24)

**Arquivo principal:** `src/app/(portal)/portal/(autenticado)/dashboard/page.tsx`

> **v3.10.24**: grade de acesso rápido removida — duplicava o nav bar (que já tem badges de docs/notas). Query redundante de `docsNovos` também removida do `page.tsx`; o layout já a faz para o badge do nav.

### Arquitetura de Componentes

`page.tsx` passou de ~470 linhas para ~130 linhas. Cards extraídos para `dashboard/_components/`:

| Componente | Tipo | Dados |
|-----------|------|-------|
| `card-obrigacoes.tsx` | Server Component (puro) | Props do page — sem fetch |
| `card-documentos.tsx` | async Server Component | Busca própria (findMany + count) |
| `card-chamados.tsx` | async Server Component | Busca própria (findMany) |
| `card-comunicados.tsx` | async Server Component | Busca própria (findMany) |
| `card-cobranca.tsx` | async Server Component | Busca própria (findFirst PENDING/OVERDUE) |
| `card-info-cliente.tsx` | Server Component (puro) | Props do page — sem fetch |
| `card-resumo-ano.tsx` | async Server Component | count() próprio + props |
| `skeletons.tsx` | Client Component | `CardListSkeleton`, `CardSmallSkeleton`, `CardResumoSkeleton` |

### Suspense Streaming

`page.tsx` faz apenas 2 queries em paralelo via `Promise.all`: `getAiConfig` e `cliente`. Os 5 componentes com fetch próprio são wrapped em `<Suspense>` com skeleton — shell renderiza imediatamente. O badge de docs do nav é calculado pelo layout (`layout.tsx`), não pelo `page.tsx`.

```tsx
// Esquerda
<Suspense fallback={<CardListSkeleton rows={4} />}><CardDocumentos /></Suspense>
<Suspense fallback={<CardListSkeleton rows={3} />}><CardChamados /></Suspense>
<Suspense fallback={null}><CardComunicados /></Suspense>

// Sidebar
<Suspense fallback={<CardSmallSkeleton />}><CardCobranca /></Suspense>
<Suspense fallback={<CardResumoSkeleton />}><CardResumoAno /></Suspense>
```

### Widget CardCobranca

Exibido apenas quando há cobrança em aberto (PENDING ou OVERDUE):

- **Estado normal** (PENDING, >3 dias): borda/fundo azul, "Vence em X dias", botão "Ver PIX/boleto →"
- **Estado urgente** (OVERDUE ou ≤3 dias): borda/fundo vermelho, botão em vermelho
- **PIX expirado** (>20h desde `pixGeradoEm` ou `atualizadoEm`): botão muda para "Gerar nova cobrança →"
- **Sem cobrança**: retorna `null` (card omitido)
- **Cálculo de dias**: `Date.UTC(ano, mes, dia)` — evita erro de timezone

### Obrigações Fiscais

Vencimentos calculados dinamicamente por `proximoAnual(mes)`:
- Se o mês ainda não passou no ano corrente → usa o ano corrente
- Se já passou → usa o próximo ano

## Página Financeiro — DAS MEI, Limite MEI e Procuração RF (v3.10.27–28)

**Arquivo:** `src/app/(portal)/portal/(autenticado)/financeiro/page.tsx`
**Componente:** `src/components/portal/portal-financeiro-client.tsx`

- **Prop `regime`**: exibe seções MEI somente quando `regime === 'MEI'`
- **Prop `procuracaoRFAtiva`**: quando `false`, renderiza banner vermelho clicável acima da seção DAS MEI ligando a `/portal/procuracao-rf`
- DAS MEI: cards responsivos (PWA-friendly) com "Copiar código" e "Baixar DAS"
- Erro de carregamento da DAS: estado `dasErro` com botão "Tentar novamente"
- **Widget Limite MEI** (`LimiteMeiWidget`): busca `GET /api/portal/financeiro/limite-mei` em paralelo com a DAS; exibe régua de faturamento anual com zona colorida (verde/amarelo/vermelho) e breakdown mensal; ocultado para não-MEI e em caso de erro (exibe aviso discreto)

### Widget LimiteMeiWidget (`src/components/ui/limite-mei-widget.tsx`)

Compartilhado entre CRM (`variant="crm"`) e portal (`variant="portal"` — padrão). Props:

| Prop | Tipo | Descrição |
|------|------|-----------|
| `acumulado` | number | Valor faturado no ano |
| `limite` | number | Limite anual (R$ 81.000) |
| `percentual` | number | 0–100 (cap visual em 100%) |
| `zona` | `verde\|amarelo\|vermelho` | Cor da régua |
| `restante` | number | Margem restante até o limite |
| `ano` | number | Ano fiscal exibido |
| `porMes` | array | Breakdown `{ mes, ano, total }` por mês |
| `variant` | `crm\|portal` | Estilo do card |

## Página Procuração RF (v3.10.27–28)

**Rota:** `/portal/procuracao-rf`
**Arquivo:** `src/app/(portal)/portal/(autenticado)/procuracao-rf/page.tsx`
**Componente:** `src/components/portal/portal-procuracao-client.tsx`

- Redireciona clientes não-MEI para `/portal/financeiro`
- **Card de status**: verde (ativa) / vermelho (pendente) com ícone de destaque
- **Botão "Já autorizei — verificar agora"**: chama `POST /api/portal/procuracao-rf` que aciona SERPRO imediatamente (ou degrada para "verificação automática" se módulo não contratado)
- **Throttle**: POST bloqueado por 10 min após verificação recente (retorna resultado cacheado)
- **Passo a passo e-CAC**: 5 etapas instruindo o cliente como conceder a procuração
- **Passo 3 — CNPJ do escritório** (v3.10.28): exibe o CNPJ formatado com botão "Copiar CNPJ" para facilitar o preenchimento no e-CAC; prop `cnpjEscritorio` passada pelo server component
- **Seção "Por que é necessária"**: explica DAS automática, situação fiscal, certidões e alertas

## Troca de Empresa Ativa (fix v3.10.49)

**Componente:** `src/components/portal/empresa-selector.tsx`
**Rota:** `POST /api/portal/empresa/trocar`

Clientes com mais de uma empresa vinculada veem o `EmpresaSelector` no topo do portal. A troca:

1. Chama `POST /api/portal/empresa/trocar` com `{ empresaId: novaId }`
2. Servidor valida acesso, re-emite JWT com `empresaId` atualizado e seta novo cookie
3. Cliente chama `router.refresh()` — todos os Server Components re-executam com o novo JWT

### Regra crítica — `domain` do cookie (produção)

O cookie de sessão do portal é emitido com `domain: '.avos.digital'` pelo NextAuth (`auth-portal.ts`). A rota `trocar` **deve usar o mesmo `domain`**, caso contrário cria um segundo cookie com nome idêntico mas `domain` diferente. O browser envia os dois; o NextAuth lê o mais antigo (RFC 6265 ordena por tempo de criação quando `path` é igual) e o `empresaId` nunca atualiza.

```typescript
// trocar/route.ts — correto
res.cookies.set(PORTAL_COOKIE_NAME, jwt, {
  httpOnly: true,
  sameSite: 'lax',
  path:     '/',
  secure:   IS_PROD,
  maxAge,
  domain:   IS_PROD ? '.avos.digital' : undefined,  // ← obrigatório
})
```

Em desenvolvimento (`localhost`) o `domain` é `undefined` nos dois casos — o cookie novo substitui o antigo e tudo funciona. O bug manifesta somente em produção.

---

## Chat Clara — Renderização de Arquivos (fix v3.10.44)

O operador pode enviar arquivos (imagens e documentos) para o cliente via `PortalConversaPanel` no `/atendimentos`. Antes do fix, esses arquivos não apareciam nem no painel CRM nem no portal do cliente.

### Fluxo de envio de arquivo (operador → portal)

1. Operador faz upload → R2 → `publicUrl` armazenado em `MensagemIA.mediaUrl`
2. `POST /api/conversas/[id]/mensagem` salva `{ conteudo: '', mediaUrl, mediaType, mediaFileName }`
3. SSE emitido via `emitConversaMensagem` com `mediaUrl`, `mediaType`, `mediaFileName`
4. `PortalConversaPanel` chama `carregar()` após envio → busca `GET /api/conversas/[id]` que retorna todos os campos (com `cache: 'no-store'`)
5. Portal do cliente recebe via SSE ou polling `GET /api/portal/chat`

### Campos de mídia em `MensagemIA`

| Campo | Preenchido quando |
|-------|------------------|
| `mediaUrl` | Arquivo enviado pelo operador (R2 URL pública) |
| `mediaType` | `'image'` ou `'document'` |
| `mediaFileName` | Nome original do arquivo |
| `hasWhatsappMedia` | Arquivo recebido via WhatsApp (mídia arquivada localmente) |

### Renderização em `PortalConversaPanel`

- `mediaUrl && mediaType === 'image'` → `<img>` com download
- `mediaUrl` (não imagem) → link estilo card com ícone `attach_file` e botão `download`
- `hasWhatsappMedia` → link para `/api/whatsapp/media/${m.id}` (mídia WhatsApp do cliente)
- `conteudo` com legenda → renderizado abaixo do arquivo

### Renderização em `portal-clara.tsx`

Mesmo padrão acima. Condição SSE corrigida de `data.conteudo` para `data.conteudo || data.mediaUrl` para não descartar mensagens com arquivo sem legenda.

---

## PortalConversaPanel — Confiabilidade de `carregar()` (fix v3.10.48)

**Arquivo:** `src/components/crm/portal-conversa-panel.tsx`

### Race condition em chamadas concorrentes (corrigido)

`carregar()` usa `carregarVersionRef` (contador incremental). Cada chamada recebe uma `version`. Após cada `await`, verifica se ainda é a mais recente; se não for, descarta a resposta.

**Cenário prevenido:** SSE dispara `void carregar()` enquanto o POST ainda está em andamento. Resposta da chamada antiga chega depois da chamada mais recente e sobrescreveria o estado com dados sem a mensagem recém-enviada.

Fetch usa `cache: 'no-store'` para prevenir que o browser sirva resposta cacheada.

### Polling duplicado com SSE ativo (corrigido)

O polling de 8s agora usa `sseHealthyRef` — idêntico ao `use-whatsapp-chat.ts`. Antes, SSE e polling disparavam `carregar()` simultaneamente sempre que o SSE estava ativo, aumentando a probabilidade de race conditions.

```
setInterval(8s):
  if (!document.hidden && !sseHealthyRef.current) void carregar()
  └─ polling só ativa quando SSE não está saudável (igual ao WhatsApp panel)
```

### Sentry nos catchs críticos (adicionado)

`assumir`, `reativarIA`, `excluirMensagem`, `enviar` e `handleFileChange` agora têm `Sentry.captureException` com tags `{ module: 'portal-conversa', operation }`. Antes, erros nesses fluxos só iam ao console local.

## PWA e Web Push

- Suporte a web push notifications
- `POST /api/portal/push/subscribe` — registra dispositivo
- Push disparado ao resolver chamados e eventos relevantes
