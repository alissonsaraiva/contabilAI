---
name: NFS-e via Spedy — Arquitetura Completa
description: Emissão/cancelamento/reemissão de NFS-e via Spedy — módulo completo v3.10.21 incluindo auto-serviço no portal do cliente
type: project
---

## Status: IMPLEMENTADO ✅ (incluindo auto-serviço no portal — v3.10.21)

## Arquitetura

**Arquivos principais:**
- `src/lib/services/notas-fiscais.ts` — orquestrador principal (re-exports do módulo nfse/)
- `src/lib/services/nfse/` — módulo extraído com submódulos
  - `emissao.ts` — emitirNotaFiscal()
  - `cancelamento.ts` — cancelarNotaFiscal() + re-indexação RAG ao cancelar
  - `reemissao.ts` — reemitirNotaFiscal()
  - `eventos.ts` — onNotaAutorizada / onNotaRejeitada / onNotaCancelada (com re-indexação RAG)
  - `webhook.ts` — processarWebhookSpedy()
  - `notificacoes.ts` — notificações para equipe (autorizada/rejeitada/portal)
  - `entrega.ts` — entregarNotaCliente() multicanal
  - `backup.ts` — salvarPdfXmlNoR2()
  - `config.ts` — getEscritorioSpedy()
- `/api/crm/notas-fiscais/**` — CRUD e ações (CRM)
- `/api/portal/notas-fiscais/**` — auto-serviço do cliente (portal)
- `/api/webhooks/spedy/[token]` — retorno assíncrono do Spedy
- `src/lib/rag/ingest-nota-fiscal.ts` — indexação RAG (autorização + cancelamento)

## Configuração por Empresa

Cada `Empresa` tem sua própria chave Spedy:
- `spedyCompanyId` — ID da empresa no Spedy
- `spedyApiKey` — chave de API (salva no banco, por empresa)
- `spedyConfigFiscal` — configuração fiscal (série RPS, etc.)
- `spedyConfigurado` — boolean: empresa habilitada para emissão

Token do webhook = SHA-256 da `spedyApiKey` → identifica a empresa.

## Fluxo CRM / IA / Agente

```
1. emitirNotaFiscal(cliente, descricao, valor, tomador)
2. POST para API Spedy
3. NotaFiscal criada com status: enviando
4. Spedy processa (SEFAZ / prefeitura)
5. Webhook /api/webhooks/spedy/[token]:
   └── autorizada → onNotaAutorizada()
       a. Salva PDF+XML no R2
       b. Indexa no RAG com status "Autorizada"
       c. Notifica equipe
       d. Entrega ao cliente (se spedyEnviarAoAutorizar)
   └── rejeitada → onNotaRejeitada() — notifica equipe
   └── cancelada → onNotaCancelada() — registra interação + re-indexa RAG com status "Cancelada"
```

## Fluxo Auto-Serviço Portal (v3.10.21)

```
1. Cliente acessa /portal/notas-fiscais
2. Dados da empresa (prestador) pré-preenchidos
3. Cliente preenche: descrição, valor, tomador
4. POST /api/portal/notas-fiscais → emitirNotaFiscal() + solicitadaPeloPortal: true
5. Nota aparece imediatamente com status "Enviando" → polling UI a cada 6s
6. Equipe notificada por notificarEquipeNfsSolicitadaPortal()

Cancelamento:
- POST /api/portal/notas-fiscais/[id]/cancelar
- Validações: ownership, status=autorizada, justificativa ≥ 15 chars, prazo ≤ 30 dias
- Se prazo esgotado: UI bloqueia + orienta abrir chamado

Reemissão:
- POST /api/portal/notas-fiscais/[id]/reemitir
- Apenas notas rejeitadas ou erro_interno
- Permite corrigir dados do tomador e valor
```

## Schema NotaFiscal (campos relevantes)

```
clienteId, empresaId, ordemServicoId
spedyId (UUID), status, numero, rpsNumero/Serie
descricao, valorTotal, issRetido
iss/pis/cofins/ir aliquotas/valores
tomadorNome, tomadorCpfCnpj, tomadorEmail, tomadorMunicipio, tomadorEstado
xmlUrl, pdfUrl, chaveAcesso, protocolo
autorizadaEm, canceladaEm, cancelamentoJustificativa
erroMensagem, erroCodigo, tentativas
enviadaClienteEm, enviadaClienteCanal
emitidaPorId       String?  — usuarioId; null = agente/automático
solicitadaPeloPortal Boolean @default(false) — true = originada pelo portal
```
Migration: `20260404220550_portal_nfse_solicitar`

## Status visíveis ao cliente (GET /api/portal/notas-fiscais)

`autorizada`, `cancelada`, `enviando`, `processando`, `rejeitada`, `erro_interno`

Filtro de mês usa `criadoEm` (nunca `autorizadaEm`) — funciona para todos os status.

## RAG — Indexação de Notas Fiscais

**Arquivo**: `src/lib/rag/ingest-nota-fiscal.ts`
- Indexado ao autorizar (`onNotaAutorizada`)
- Re-indexado ao cancelar (`cancelamento.ts` e `onNotaCancelada`)
- Texto inclui: número, prestador, tomador, data, competência, valor, ISS, descrição, protocolo, **status**, **data de cancelamento**
- Canal: `geral` — visível para CRM, portal e WhatsApp

## Tools disponíveis (todas os 3 canais: crm, whatsapp, portal)

`emitirNotaFiscal`, `cancelarNotaFiscal`, `reemitirNotaFiscal`, `verificarConfiguracaoNfse`, `consultarNotasFiscais`, `enviarNotaFiscalCliente`, `reenviarEmailNotaFiscal`, `buscarTomadoresRecorrentes`

## Clara (portal AI) — SYSTEM_NFSE_INSTRUCOES_PORTAL

Clara sabe sobre:
- Emissão via chat (usando tools)
- Consulta de notas (`consultarNotasFiscais`)
- Reenvio/download via portal
- **Cancelamento via portal UI** (seção adicionada v3.10.21): orienta sobre prazo 30 dias e fallback chamado
- **Reemissão via portal UI** (seção adicionada v3.10.21): orienta para notas rejeitadas/erro

## Componentes do portal NFS-e (v3.10.21 refatoração)

`portal-notas-fiscais-client.tsx` reduzido de ~875 para ~140 linhas. Subfolder `src/components/portal/notas-fiscais/` com 6 arquivos:
- `_shared.ts` — tipos, constantes, helpers (validarCpfCnpj usa checksum real)
- `_modal.tsx` — Spinner, ModalOverlay, ModalHeader, ModalFooter
- `nota-card.tsx` — card com banners e ações
- `nfse-form-fields.tsx` — campos compartilhados entre ModalEmitir e ModalReemitir
- `modal-emitir.tsx`, `modal-cancelar.tsx`, `modal-reemitir.tsx` — cada um com estado próprio

## Ponto de Falha

Webhook Spedy assíncrono **sem retry** — se o webhook falhar, NFS-e fica em `enviando` indefinidamente.
Cron `/api/cron/reconciliar-notas` (healthchecks.io: `HC_RECONCILIAR_NOTAS`) reconcilia periodicamente.

**Why:** Spedy não garante entrega do webhook
**How to apply:** Ao implementar features de NFS-e, sempre considerar o estado `enviando` como potencialmente preso. Frontend portal já faz polling automático (6s) e para quando não há notas em processamento.
