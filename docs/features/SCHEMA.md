# SCHEMA — Banco de Dados

> **Sistema:** AVOS v3.10.24 | **Fonte:** `SISTEMA.md` (extraído)

---

## Hierarquia de Entidades

```
Escritorio (1)
    ↓
    ├── Usuario (N) — funcionários CRM
    ├── Plano (N) — catálogo de planos
    ├── Lead (N) — prospects em onboarding
    │       └── Contrato (1)
    ├── Cliente (N) — clientes ativos
    │       ├── Empresa (1) — PJ obrigatória
    │       │       └── Socio (N) — sócios com acesso portal
    │       ├── Documento (N)
    │       ├── Chamado (N)
    │       │       └── ChamadoNota (N) — notas internas do escritório
    │       ├── CobrancaAsaas (N)
    │       ├── NotaFiscal (N)
    │       ├── Interacao (N)
    │       └── ConversaIA (N)
    │               └── MensagemIA (N)
    └── Comunicado (N)
            └── ComunicadoEnvio (N) — por cliente
```

## Enums Críticos

```
StatusLead: iniciado | simulador | plano_escolhido | dados_preenchidos | revisao |
            contrato_gerado | aguardando_assinatura | assinado | expirado | cancelado

StatusCliente: ativo | inadimplente | suspenso | cancelado

StatusNotaFiscal: rascunho | enviando | processando | autorizada | rejeitada |
                  cancelada | erro_interno

StatusOS (Chamado): aberta | em_andamento | aguardando_cliente | resolvida | cancelada

StatusEscalacao: pendente | em_atendimento | resolvida

CanalEscalacao: whatsapp | onboarding | portal
```

## Decisões de Arquitetura

- **`Empresa.status` removido** (migration `20260404010142_remove_empresa_status`): o status exibido em `/crm/empresas` vem de `empresa.cliente.status` — única fonte de verdade
- **Tabela `ordens_servico`** → renomeada para `chamados` logicamente via `@@map` (v3.10.13): modelo `OrdemServico` → `Chamado`, sem alterar tabela física
- **`CobrancaAsaas.pixGeradoEm`** (migration `20260405012615_add_pix_gerado_em`): `DateTime?` setado apenas quando QR Code chega do Asaas. Usado para calcular expiração do PIX (20h) com precisão — `atualizadoEm` é `@updatedAt` e é resetado por qualquer webhook.
- **Migrations**: 37+ arquivos SQL em `prisma/migrations/`
- **Schema principal**: `prisma/schema.prisma` (~1015 linhas, 31+ modelos)

## Regras de Migração

- NUNCA `prisma db push` em produção — bypassa histórico de migrations → erros P2022
- SEMPRE `prisma migrate dev --name <nome>` para criar nova migration
- Seed: `npx prisma db seed` (planos iniciais)
- pgvector: `psql $DATABASE_URL -f prisma/init-vectors.sql`
