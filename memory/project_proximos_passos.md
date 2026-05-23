---
name: project_proximos_passos
description: Próximos passos a definir/implementar — features planejadas mas pendentes de decisão ou execução
type: project
---

# Próximos Passos Pendentes

## 1. Chamados Unificados (substituir Tarefas)

Decisão tomada: usar OrdemServico como sistema único de trabalho (clientes + IA + operadores).
Tarefas antigas serão descontinuadas.

**Schema a implementar:**
- `OrigemOS` enum: `cliente | ia | operador`
- `TipoOS` novos valores: `emissao_documento`, `correcao_documento`, `solicitacao_documento`, `tarefa_interna`
- Campos novos em `OrdemServico`: `origem`, `visivelPortal`, `responsavelId`, `prazo`, `documentoId`, `metadados`
- `MensagemIA`: campo `aiProcessado Boolean @default(false)` (debounce)
- `ConversaIA`: campo `ultimaMensagemEm DateTime?` (debounce)

**Tools a implementar:**
- `criarOrdemServico` — canal: crm, whatsapp, portal, onboarding (todas as IAs podem abrir chamados)
- Atualizar `listarOrdensServico`: canal portal + filtros `origem`/`visivelPortal`
- Atualizar `responderOrdemServico`: campo `documentoId` para auto-dispatch
- Remover do `index.ts`: `criarTarefa`, `listarTarefas`, `concluirTarefa`
- Atualizar `registrarInteracao`: adicionar canal `whatsapp`
- Atualizar `buscarDocumentos`: adicionar filtro `periodo` (ex: "novembro/2025")

**CRM a implementar:**
- `PATCH /api/crm/ordens-servico/[id]`: auto-dispatch quando `documentoId` + `status: resolvida`
- `os-responder-form.tsx`: seletor de documento vinculado
- Sidebar CRM: remover "Tarefas", manter "Chamados"

## 2. Fluxo de Documentos — ARQUITETURA IMPLEMENTADA ✅ (v3.3)

Gerenciador unificado com 7 serviços centralizados implementado em 2026-03-28.
Ver `memory/project_document_architecture.md` para detalhes completos.

**Ainda pendente:**
- Estratégia de senha para WhatsApp (`Escritorio.whatsappDocumentoEntrega = 'senha'`):
  - Formatos: PDF (qpdf), OFX/XLS (7z AES-256)
  - `senhaDocumentos String?` em `Cliente` (criptografado)
  - Dockerfile: `apt-get install qpdf p7zip-full`
  - Função `protegerDocumento(buffer, mimeType, senha)` → implementar em `entregar-documento.ts`
- `solicitarDocumento` tool: cria OS quando doc não existe
- `buscarDocumentos`: adicionar filtro `periodo` (ex: "novembro/2025")

## 3. ~~WhatsApp Debounce~~ — JÁ IMPLEMENTADO ✅

Agrupamento de mensagens via `ultimaMensagemEm` no banco + cron `processar-pendentes`.
Ver `src/lib/whatsapp/processar-pendentes.ts` e `src/app/api/whatsapp/processar-pendentes/route.ts`.

## 4. Lembretes Fiscais Automáticos (proativos)

Ver `project_calendario_fiscal.md` para o calendário completo.

**Implementação:**
- Tool `lembrarObrigacaoFiscal` — cron mensal por tipo de cliente
- Templates de mensagem por tipo: MEI (DAS dia 20), autônomo (carnê-leão), EPP (DAS + PGDAS)
- Lógica: verificar obrigações com vencimento nos próximos 7 dias → disparar WhatsApp texto

## 5. ~~Emissão de NF-S-e~~ — JÁ IMPLEMENTADA ✅ (v3.10.x)

NFS-e via **Spedy** está completa: emissão, cancelamento, reemissão, entrega multicanal.
Webhook `/api/webhooks/spedy/[token]` processa retornos da SEFAZ.
Tools: `emitirNotaFiscal`, `cancelarNotaFiscal`, `reemitirNotaFiscal`, `verificarConfiguracaoNfse`, `consultarNotasFiscais`.

## Why

Tudo acima foi planejado em 2026-03-28 mas revertido/adiado para o usuário revisar com calma.
Arquitetura geral foi aprovada, apenas a execução está pendente.

## How to apply

Quando o usuário pedir para implementar qualquer desses itens, usar este documento como ponto de partida.
Confirmar com usuário se as decisões pendentes foram tomadas antes de implementar.
