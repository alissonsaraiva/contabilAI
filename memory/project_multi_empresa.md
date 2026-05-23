---
name: Multi-Empresa 1:N — Implementado
description: Cliente↔Empresa migrado de 1:1 para 1:N em v3.10.38 — schema, portal, CRM, IAs, NFS-e, DAS-MEI, documentos, crons — tudo completo
type: project
---

## Status: IMPLEMENTADO em v3.10.38 (2026-04-10)

Cliente↔Empresa migrado de 1:1 para 1:N. Um cliente (CPF) pode ter N empresas (CNPJs).

## Arquitetura

- **Schema**: tabela `ClienteEmpresa` (junção com `principal` flag) + `Cliente.empresaId` mantido como atalho legado
- **Helper `vincularEmpresa()`**: escreve nos dois lugares (legado + junção) em toda criação de vínculo
- **Resolução**: `resolverEmpresasDoCliente()` para todas as empresas, `resolverEmpresaIdDoCliente()` para a principal

## Padrão de fallback (obrigatório em todo novo código)

```typescript
// Sempre: junção 1:N → fallback legado
const empresas = await resolverEmpresasDoCliente(clienteId)
// OU para a principal:
const empresaId = await resolverEmpresaIdDoCliente(clienteId)
```

## Portal

- JWT carrega `empresaIds` (JSON array) + `empresaId` (ativa)
- `EmpresaSelector` no header quando N > 1
- `POST /api/portal/empresa/trocar` re-emite JWT
- Todas pages usam `user.empresaId` (empresa ativa da sessão)

## CRM

- `EmpresasAccordion` na ficha do cliente (tab Dados)
- `AdicionarEmpresaButton` com drawer (CNPJ auto-fill)
- `DocumentoUpload` com picker de empresa quando N > 1
- `DocumentoPicker` com badge de empresa + botões WhatsApp/email

## IAs

- WhatsApp: system prompt lista todas empresas; instrução para perguntar qual antes de operações
- Portal: contexto da empresa ativa + lista outras
- CRM: lista todas no contexto; `empresaIdPrincipal` no ToolContext
- Tools (15): detectam multi-empresa e pedem confirmação quando ambíguo

## NFS-e + DAS-MEI

- `EmitirNotaInput.empresaId?` — aceita empresa explícita
- `gerarESalvarDASMEI(clienteId, comp?, empresaId?)` — idem
- Crons (gerar-das, verificar-procuração) iteram via `clienteEmpresas`

## Detecção automática de empresa

- `detectarEmpresaPorConteudo()` — extrai CNPJs de PDFs/textos e faz match
- Integrado em email/processar.ts e anexar-documento-chat

## Cobrança

- Cobrança Asaas é por CLIENTE (CPF), não por empresa — não muda com multi-empresa
- Fix: cobrança gentil agora valida `sendResult.ok` antes de registrar sucesso
