---
name: project_document_architecture
description: Arquitetura de documentos v3.10.38: visivelPortal, PATCH endpoint, upload em lote, drag & drop, preview inline, rename inline, edição completa, componentização
type: project
---

# Arquitetura de Documentos — v3.10.38

## Campo `visivelPortal` (migration 20260410)

- `Boolean @default(true)` — se `false`, documento é **interno** (não aparece no portal)
- Portal filtra `visivelPortal: true` na query server-side
- CRM: toggle rápido via ícone olho + filtro dropdown "Portal: Visível/Interno"
- Upload: checkbox "Portal" no form de upload (default: true)

## PATCH `/api/crm/documentos/[id]`

Campos editáveis: `nome`, `tipo`, `categoria`, `status`, `visivelPortal`, `observacao`
Re-indexa RAG se nome/tipo/categoria mudaram.

## Componentes CRM — Documentos (componentizados)

| Componente | Arquivo | Responsabilidade |
|---|---|---|
| `DocumentosTabContent` | `src/components/crm/documentos-tab-content.tsx` | Orquestrador: filtros, agrupamento ano/mês, modais |
| `DocumentoRow` | `src/components/crm/documento-row.tsx` | Linha individual: rename inline, toggle visibilidade, preview, edit, delete |
| `DocumentoEditModal` | `src/components/crm/documento-edit-modal.tsx` | Modal de edição completa |
| `DocumentoPreviewModal` | `src/components/crm/documento-preview-modal.tsx` | Preview inline: PDF (iframe) / imagem (img) |
| `EmpresaDocumentoUpload` | `src/components/crm/empresa-documento-upload.tsx` | Upload em lote, drag & drop, checkbox portal |

## Upload em lote

- `multiple` no input + drag & drop zone
- Concorrência limitada a 3 uploads simultâneos
- Progress individual por arquivo (pending/uploading/done/error)
- Retry: reenviar arquivos que falharam
- Tipo/categoria/visivelPortal herdados do form global

## Service `criarDocumento`

Aceita `visivelPortal?: boolean` (default: true). Restante inalterado.

## APIs

- `POST /api/crm/clientes/[id]/documentos` — aceita `visivelPortal` no formData
- `GET  /api/crm/clientes/[id]/documentos` — retorna `visivelPortal`, `xmlMetadata`, `resumoStatus`, `observacao`
- `PATCH /api/crm/documentos/[id]` — edição parcial
- `DELETE /api/crm/documentos/[id]` — soft-delete + RAG + S3

## Why

Evolução implementada em 2026-04-10 para dar controle total ao operador sobre documentos: visibilidade, metadados, upload em massa, preview rápido.

## How to apply

- Sempre usar `criarDocumento()` com `visivelPortal` quando doc não deve ir pro portal
- Para edição de documento: usar PATCH endpoint (nunca update manual no prisma)
- Novos campos no Documento: adicionar ao `select` do GET e ao type `Documento` em `documento-row.tsx`
