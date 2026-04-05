# PORTAL — Portal do Cliente

> **Sistema:** AVOS v3.10.23 | **Fonte:** `SISTEMA.md` (extraído)

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

## Dashboard do Portal (v3.10.22)

**Arquivo principal:** `src/app/(portal)/portal/(autenticado)/dashboard/page.tsx`

### Acesso Rápido

Grade de 4 atalhos no topo da página (após a saudação):

| Atalho | Ícone | Badge | Destino |
|--------|-------|-------|---------|
| Documentos | `folder_open` | Docs não-visualizados (total real) | `/portal/documentos` |
| Financeiro | `payments` | — | `/portal/financeiro` |
| NFS-e (PJ) / Meus dados (PF) | `receipt_long` / `badge` | — | `/portal/notas-fiscais` ou `/portal/empresa` |
| Chamado | `add_circle` | — | `/portal/suporte/chamados/nova` |

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

`page.tsx` faz apenas 3 queries em paralelo via `Promise.all`: `getAiConfig`, `cliente` e `docsNovos` (count). Os 5 componentes com fetch próprio são wrapped em `<Suspense>` com skeleton — shell renderiza imediatamente.

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

## PWA e Web Push

- Suporte a web push notifications
- `POST /api/portal/push/subscribe` — registra dispositivo
- Push disparado ao resolver chamados e eventos relevantes
