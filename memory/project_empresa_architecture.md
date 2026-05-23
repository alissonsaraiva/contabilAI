---
name: project_empresa_architecture
description: Decisão arquitetural de extrair Empresa como entidade de primeira classe, separando dados pessoais do Cliente dos dados da empresa, e habilitando acesso de sócios ao portal
type: project
---

Decisão tomada em 2026-03-27: extrair `Empresa` como entidade de primeira classe no schema.

**Why:** Cliente hoje mistura dados pessoais + dados da empresa no mesmo model. Portal é na verdade um portal da empresa — sócios também devem ter acesso, não apenas o titular.

**How to apply:** Ao modificar qualquer coisa relacionada a Cliente, Socio ou Portal, considerar que agora existe `Empresa` como pivot central.

## ⚠️ Atualização 2026-04-04: `Empresa.status` REMOVIDO

Migration `20260404010142_remove_empresa_status` removeu o campo `status` de `Empresa`. O status exibido em `/crm/empresas` e no detalhe da empresa vem de `empresa.cliente.status` — única fonte de verdade. Enum válido: `ativo | inadimplente | suspenso | cancelado`.

**Motivo:** O campo era redundante com `Cliente.status`, nunca era sincronizado automaticamente (causava inconsistência entre `/crm/clientes` e `/crm/empresas`), e tinha valores inválidos (`inativo`, `rescindido`) no dropdown que causariam erro P2009 ao salvar.

## ⚠️ Atualização 2026-04-14: Tab "Sócios" removida da ficha do cliente (v3.10.61)

A aba "Sócios" que existia na ficha do cliente (`/crm/clientes/[id]`) foi removida. O gerenciamento de sócios (adicionar, editar, remover, portal controls) é feito **exclusivamente** na página da empresa (`/crm/empresas/[id]` → tab "Sócios").

**Motivo:** A entidade `Socio` está vinculada à `Empresa`, não ao `Cliente`. Exibir sócios na ficha do cliente era um resquício da arquitetura anterior (quando `Socio` tinha `clienteId`). Manter as duas telas causava confusão sobre onde fazer alterações.

---

## Página `/crm/empresas/[id]` — refatorada (2026-04-04)

`page.tsx` foi de 722 → 186 linhas. Cada aba agora vive em `_components/`:
- `empresa-header.tsx` — badges de status/regime, botões de ação
- `tab-visao-geral.tsx` — 4 InfoCards (empresa, contrato, NFS-e, atividade)
- `tab-titular.tsx` — dados pessoais e contratuais do cliente com `EditarClienteButton`
- `tab-socios.tsx` — grid com CRUD + portal controls + botão WhatsApp
- `tab-chamados.tsx` — tabela de chamados da empresa
- `tab-portal.tsx` — lista de acessos ao portal

Componentes reutilizáveis criados em `src/components/crm/info-card.tsx`:
`InfoCard`, `InfoRow`, `EmptyState`, `PlaceholderTab` — usar nesses em qualquer página CRM que precise de cards informativos.

Tipos usam enums do Prisma diretamente (`Regime`, `StatusCliente`, `PlanoTipo`, `FormaPagamento`) — não strings.

## Sócios — CRUD implementado (2026-04-04)

APIs:
- `POST /api/crm/empresas/[id]/socios` — criar sócio
- `PATCH /api/crm/socios/[id]` — editar dados
- `DELETE /api/crm/socios/[id]` — remover (revoga portal automaticamente)

Componentes: `AdicionarSocioDrawer`, `EditarSocioDrawer` (com confirmação de exclusão).

Todos reindexam a empresa no RAG após alteração.

## Modelo atual

```
Empresa
  - id, cnpj (nullable), razaoSocial (nullable), nomeFantasia (nullable)
  - regime (nullable)  ← status REMOVIDO em 2026-04-04
  - clienteId (1-to-1 com Cliente titular)
  - socios[] (Socio vinculado à Empresa, não mais ao Cliente)

Cliente
  - dados pessoais: cpf, email, nome, telefone, endereço
  - dados contratuais: planoTipo, valorMensal, vencimentoDia, formaPagamento, status
  - empresaId → Empresa (nullable durante transição)
  - REMOVIDOS: cnpj, razaoSocial, nomeFantasia, regime

Socio
  - empresaId (era clienteId)
  - portalAccess: boolean (padrão false)
  - portalTokens[] (novo — acesso ao portal igual ao titular)

PortalToken
  - clienteId (nullable)
  - socioId (nullable — novo)
  - empresaId (obrigatório — novo)
  - constraint: clienteId OR socioId deve estar preenchido
```

## Decisões de produto confirmadas
- Sócio tem acesso total ao portal (igual ao titular)
- Magic link igual ao titular (mesmo fluxo)
- Onboarding: NÃO coleta sócios — manter simples; sócios são cadastrados depois via CRM ou portal
- Migração em produção: pode apagar/recriar dados (apenas testes/mocks em prod)

## Sync bidirecional Sócio↔Cliente por CPF (v3.10.60)

Quando um `Socio` e um `Cliente` compartilham o mesmo CPF (pessoa que é sócia de uma empresa e também cliente direto), os campos de contato são sincronizados automaticamente:

- **Campos:** `email`, `telefone`, `whatsapp`
- **Implementação:** `src/lib/clientes/sync-contato-cpf.ts`
- **Trigger:** chamado nas rotas de edição de sócio e de cliente após persistência

Isso evita divergência de contato entre as duas entidades que representam a mesma pessoa. Exemplo: titular do escritório que também é sócio de uma das empresas atendidas — atualizar o WhatsApp em um registro propaga para o outro.

---

## Conversão Lead→Cliente (3 locais)
- src/app/api/leads/[id]/contrato/route.tsx
- src/app/api/webhooks/zapsign/route.ts
- src/app/api/webhooks/clicksign/route.ts

Todos devem usar helper centralizado `src/lib/clientes/criar-de-contrato.ts` que cria Cliente + Empresa na mesma transação.

## Session do portal
```ts
{
  id: clienteId | socioId,
  tipo: 'cliente' | 'socio',
  empresaId: string,  // chave para scopar dados do portal
  nome, email
}
```
