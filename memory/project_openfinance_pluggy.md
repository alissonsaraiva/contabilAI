---
name: project_openfinance_pluggy
description: Plano de integração Open Finance via Pluggy — arquitetura, fases, modelos, tools, RAG, dashboard
type: project
---

# Open Finance via Pluggy — Plano de Integração

**Status**: Planejamento (2026-03-28)

## Objetivo
Cliente conecta conta bancária → transações chegam automaticamente → IA analisa → escritório entrega valor via CRM/portal/WhatsApp.

## Decisões de Arquitetura

### Abordagem: Document-Based vs Transaction-Based
**Decisão**: Híbrida — adicionar modelos de transações específicos (não usar Documento existente para transações bancárias, pois o modelo é orientado a arquivos/S3, não a movimentos financeiros).

### Armazenamento de Credenciais Pluggy
Usar padrão AES-256-GCM existente no modelo `Escritorio`:
- `pluggyClientId` (encrypted)
- `pluggyClientSecret` (encrypted)

### Token por Cliente
Usar modelo `PluggyConexao` (novo) com token criptografado por `clienteId`.

## Modelos a Adicionar (Prisma)

### PluggyConexao
```prisma
model PluggyConexao {
  id          String   @id @default(cuid())
  clienteId   String   @unique
  itemId      String   // Pluggy item ID
  status      String   // connected | disconnected | updating | login_error
  ultimoSync  DateTime?
  criadoEm   DateTime @default(now())
  atualizadoEm DateTime @updatedAt
  cliente     Cliente  @relation(...)
  contas      PluggyAccount[]
}
```

### PluggyAccount
```prisma
model PluggyAccount {
  id          String   @id @default(cuid())
  conexaoId   String
  pluggyId    String   @unique
  banco       String
  tipo        String   // CHECKING | SAVINGS | CREDIT
  nome        String
  saldo       Decimal
  limite      Decimal?
  criadoEm   DateTime @default(now())
  conexao     PluggyConexao @relation(...)
  transacoes  PluggyTransacao[]
}
```

### PluggyTransacao
```prisma
model PluggyTransacao {
  id          String   @id @default(cuid())
  contaId     String
  pluggyId    String   @unique  // idempotência
  descricao   String
  valor       Decimal
  tipo        String   // CREDIT | DEBIT
  categoria   String?
  categoriaNorm String?  // categoria normalizada pela IA
  data        DateTime
  criadoEm   DateTime @default(now())
  conta       PluggyAccount @relation(...)
}
```

## Estrutura de Arquivos

```
src/lib/pluggy/
  index.ts         — cliente Pluggy (auth, refresh)
  service.ts       — lógica de sync, processar webhook
  categorizer.ts   — normalização de categorias (regras + IA)
  aggregator.ts    — resumos mensais, cálculo saldos

src/app/api/pluggy/
  connect/route.ts       — gera link_token para widget
  status/[id]/route.ts   — status da conexão do cliente
  sync/[id]/route.ts     — sync manual (admin trigger)

src/app/api/webhooks/pluggy/route.ts  — webhook events

src/lib/ai/tools/
  consultar-saldo-cliente.ts
  listar-transacoes-cliente.ts
  resumo-financeiro-cliente.ts
  detectar-anomalias-financeiras.ts
```

## RAG
Novo tipo: `dados_financeiros` no escopo `cliente`
- Indexar resumos mensais agregados (NÃO transação individual)
- Indexar categorias com totais
- Recalcular a cada sync

## Fases de Implementação

### Fase 1 — Fundação (banco + credenciais)
- Modelos Prisma (PluggyConexao, PluggyAccount, PluggyTransacao)
- Campos encrypted no Escritorio (pluggyClientId, pluggyClientSecret)
- Config page no CRM para o escritório configurar

### Fase 2 — Integração Pluggy (conexão + webhook)
- Serviço `/src/lib/pluggy/index.ts` (auth + token)
- Endpoint `/api/pluggy/connect` (link_token)
- Webhook `/api/webhooks/pluggy` (processamento)
- Fila assíncrona (usar setTimeout/setImmediate ou BullMQ se precisar escalar)

### Fase 3 — Processamento (categorização + RAG)
- Normalização de categorias (regras simples primeiro)
- Indexação RAG de resumos mensais
- Notificação para o escritório quando sync completa

### Fase 4 — Tools da IA (6 tools essenciais)
- consultar-saldo-cliente
- listar-transacoes-cliente
- resumo-financeiro-cliente
- detectar-anomalias-financeiras
- gerar-relatorio-dre-simplificado
- alertar-inadimplencia-provavel

### Fase 5 — Dashboard + Portal
- Dashboard financeiro no CRM (recharts já disponível)
- Extrato no portal do cliente (já existe portal v3)
- Alertas proativos via WhatsApp/email

## Pontos Críticos
1. **Idempotência**: verificar `pluggyId` antes de inserir transação
2. **Sync incremental**: usar `updatedAt` do Pluggy, nunca puxar tudo
3. **Consentimento**: tratar expiração com reconexão no portal
4. **Dados sujos**: normalização antes de indexar no RAG
5. **Fila**: não processar webhook síncrono — risco de timeout

## Why
Diferencial competitivo: escritório contábil com IA financeira em tempo real. Aumenta retenção e ticket.

## How to apply
Ao implementar qualquer parte desta feature, seguir o padrão de serviço + API + tool + RAG já estabelecido. Credenciais sempre AES-256-GCM no Escritorio.
