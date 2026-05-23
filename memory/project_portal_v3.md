---
name: Portal do Cliente v3.10.21 — Arquitetura
description: Estrutura completa do portal — páginas, APIs, PWA, NFS-e auto-serviço, OrdemServico, Comunicado
type: project
---

## Páginas do portal (`/portal/*`)

| Rota | Descrição |
|---|---|
| `/portal/dashboard` | Overview: plano, mensalidade, quick actions, chamados, comunicados |
| `/portal/empresa` | Dados da empresa: CNPJ, regime, titular, sócios, plano contratado |
| `/portal/documentos` | Lista + upload de arquivos + visualização de metadados XML |
| `/portal/notas-fiscais` | **NFS-e auto-serviço**: emitir, cancelar, reemitir — apenas PJ com Spedy configurado |
| `/portal/suporte` | Chamados ativos, comunicados, CTA Clara |
| `/portal/suporte/os/nova` | Formulário para abrir chamado (client component) |
| `/portal/suporte/os/[id]` | Detalhe do chamado + avaliação |
| `/portal/suporte/chamados` | Lista completa paginada com filtros de status |
| `/portal/configuracoes` | Dados de acesso, sócios com permissão |

## APIs do portal

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/portal/notas-fiscais` | GET | Listar NFS-e (todos status relevantes: autorizada, cancelada, enviando, processando, rejeitada, erro_interno) |
| `/api/portal/notas-fiscais` | POST | Emitir nova NFS-e (validações: spedyConfigurado, tipoContribuinte ≠ pf) |
| `/api/portal/notas-fiscais/[id]` | GET | Detalhe da nota |
| `/api/portal/notas-fiscais/[id]/cancelar` | POST | Cancelar nota autorizada (ownership + prazo ≤ 30 dias + justificativa ≥ 15 chars) |
| `/api/portal/notas-fiscais/[id]/reemitir` | POST | Reemitir nota rejeitada/erro_interno com overrides opcionais |
| `/api/portal/notas-fiscais/[id]/pdf` | GET | Download PDF (R2-first → Spedy fallback) |
| `/api/portal/notas-fiscais/[id]/xml` | GET | Download XML (R2-first → Spedy fallback) |
| `/api/portal/documentos/upload` | POST | Upload de arquivo (multipart), parse XML automático |
| `/api/portal/ordens-servico` | GET/POST | Listar/criar chamados |
| `/api/portal/ordens-servico/[id]` | GET/PATCH | Detalhe/avaliar/cancelar chamado |
| `/api/portal/comunicados` | GET | Comunicados publicados e não expirados |

## NFS-e no portal (v3.10.21)

**Page**: `src/app/(portal)/portal/(autenticado)/notas-fiscais/page.tsx`
**Thin orchestrator**: `src/components/portal/portal-notas-fiscais-client.tsx` (~140 linhas)

**Arquitetura de componentes** (`src/components/portal/notas-fiscais/`):
- `_shared.ts` — tipos (`NotaFiscal`, `FormState`), constantes (`STATUS_LABELS/COLORS/ICONS`, `INPUT`), helpers (`parseBRL`, `formatCnpj`, `validarCpfCnpj` com checksum real via `validarCPF`/`validarCNPJ`), funções (`podeCancelar`, `cancelamentoPrazoEsgotado`)
- `_modal.tsx` — primitivos genéricos: `Spinner`, `ModalOverlay`, `ModalHeader`, `ModalFooter`
- `nota-card.tsx` — card completo com banners contextuais e ações
- `nfse-form-fields.tsx` — campos do formulário compartilhados (serviço + tomador)
- `modal-emitir.tsx` — estado próprio, toast inteligente por `data.status`
- `modal-cancelar.tsx` — estado próprio, textarea justificativa + contador chars
- `modal-reemitir.tsx` — estado próprio, campos pré-preenchidos da nota

**Funcionalidades:**
- Prestador (empresa) pré-preenchido na UI
- Cliente preenche: descrição, valor (aceita notação BR: "3.000,00"), tomador
- Validação CPF/CNPJ com dígito verificador real (`validarCPF`/`validarCNPJ`)
- `parseBRL()` — converte string BRL para número (strip separadores de milhar)
- Polling automático a cada 6s enquanto há notas em `enviando`/`processando`
- Paginação load-more: botão "Carregar mais (N restantes)" com estado `page`/`loadingMore`
- Toast inteligente: verifica `data.status` da resposta — mensagem diferente para `autorizada`, `rejeitada`/`erro_interno`, ou processando
- Banners contextuais: processamento em curso, rejeição com motivo do erro
- Cancelamento: botão visível apenas em notas autorizadas ≤ 30 dias; após prazo, banner laranja com instruções
- `solicitadaPeloPortal: true` marca a origem para auditoria

## CRM — badge Portal

`src/components/crm/notas-fiscais/nota-fiscal-card.tsx`: badge azul "Portal" quando `nota.solicitadaPeloPortal === true`.

## Modelos adicionados

**NotaFiscal:**
- `solicitadaPeloPortal Boolean @default(false)` — rastreia origem portal
- Migration: `20260404220550_portal_nfse_solicitar`

**Documento (anterior):**
- `origemPortal Boolean @default(false)` — enviado pelo cliente
- `xmlMetadata Json?` — dados extraídos do XML

**OrdemServico (anterior):**
- `clienteId`, `empresaId`, `tipo TipoOS`, `titulo`, `descricao`, `status StatusOS`
- `prioridade Prioridade`, `resposta`, `respondidoEm`, `respondidoPorId`
- `avaliacaoNota Int?`, `avaliacaoComent String?`, `fechadoEm`

**Comunicado (anterior):**
- `titulo`, `conteudo`, `tipo TipoComunicado`, `publicado Boolean`, `publicadoEm`, `expiradoEm`

## PWA

- `src/app/manifest.ts` → `/manifest.webmanifest` (dinâmico com nome/cor do escritório)
- `public/sw.js` → service worker (network-first, cache para offline)
- `src/components/portal/portal-pwa.tsx` → banner de instalação (beforeinstallprompt)

## Libs criadas

- `src/lib/xml-parser.ts` — `parseXML(content)` retorna XMLMetadata com tipo NFe/NFS-e/CT-e/NFC-e
- `src/lib/portal-session.ts` — `resolveClienteId(user)` resolve sócio → clienteId do titular

## CRM — novas páginas

| Rota | Descrição |
|---|---|
| `/crm/ordens-servico` | Fila de chamados com filtros por status e prioridade |
| `/crm/ordens-servico/[id]` | Detalhe + formulário de resposta/status |
| `/crm/comunicados` | Criar, publicar, despublicar, excluir comunicados |

**Why:** Portal evoluiu de visualização passiva para plataforma de auto-serviço: NFS-e (emissão/cancelamento/reemissão), documentos bidirecionais, suporte formal, comunicados, configurações e PWA.
**How to apply:** Qualquer feature do portal usa `resolveClienteId()` para resolver sócio→cliente. NFS-e no portal requer `spedyConfigurado = true` e `tipoContribuinte ≠ 'pf'` — verificar em server component antes de renderizar.
