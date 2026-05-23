---
name: Agente Operacional CRM — Arquitetura
description: Sistema completo de agente com tools, registry, cron, toggle de features — 40+ tools implementadas (atualizado 2026-04-06 v3.10.27)
type: project
---

## Visão geral

O agente operacional é o motor de tool use do CRM. Permite que a IA do CRM (assistente global) execute ações reais no sistema, não apenas responder perguntas.

## Tool Registry (`src/lib/ai/tools/registry.ts`)

Singleton `Map<string, Tool>`. Cada tool se auto-registra ao ser importada:

```typescript
registrarTool(minhaTool) // chamado no final de cada arquivo de tool
```

Funções exportadas:
- `getTools()` → `Tool[]`
- `getTool(name)` → `Tool | undefined`
- `getToolDefinitions(names?)` → definições filtradas para o LLM
- `getCapacidades()` → lista para UI (label, descrição, categoria, canais)

## Tool — estrutura (`src/lib/ai/tools/types.ts`)

```typescript
type Tool = {
  definition: {
    name: string
    description: string
    input_schema: { type: 'object', properties: {...}, required: [...] }
  }
  meta: {
    label: string
    descricao?: string
    categoria: string         // 'Consulta' | 'Ação' | 'Agendamento' | etc.
    canais: ('crm' | 'whatsapp' | 'portal' | 'onboarding')[]
  }
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>
}

type ToolContext = {
  clienteId?: string
  leadId?: string
  solicitanteAI?: string
  usuarioId?: string
  usuarioNome?: string
  usuarioTipo?: string
}
```

## Registro de todos os tools (`src/lib/ai/tools/index.ts`)

Importações side-effect — apenas importar o arquivo já registra a tool. Toda nova tool deve ser adicionada aqui.

## Permissões por canal (`src/lib/ai/agent.ts` — `TOOLS_POR_FEATURE`)

```
crm:         undefined  → acesso total a todas as tools
whatsapp:    lista restrita (buscar dados, responder escalação, etc.)
portal:      lista restrita (buscar dados do cliente)
onboarding:  lista restrita (listar planos, criar lead)
```

## Tools implementadas — 40+ total (v3.10.27, atualizado 2026-04-06)

**ATENÇÃO**: Módulo de Tarefas foi REMOVIDO. `criarTarefa`, `listarTarefas`, `concluirTarefa` NÃO EXISTEM MAIS.
NFS-e via Spedy JÁ ESTÁ IMPLEMENTADA (não é mais feature futura).

### Leitura/Consulta (15 tools)
`buscarDadosCliente`, `buscarDadosOperador`, `consultarDados`, `buscarHistorico`, `buscarDocumentos`, `buscarOrdenServico`, `buscarEmailInbox`, `buscarTomadoresRecorrentes`, `buscarCobrancaAberta`, `listarLeadsInativos`, `listarComunicados`, `listarPlanos`, `listarAgendamentos`, `listarDocumentosPendentes`, `listarEmailsPendentes`

### Escrita/Mutação (20 tools)
`criarLead`, `criarCliente`, `atualizarDadosCliente` (⚠️ typo no código: `atudalizarDadosCliente`), `atualizarStatusLead`, `avancarLead`, `criarOrdemServico`, `responderOrdemServico`, `registrarInteracao`, `enviarEmail`, `enviarWhatsappCliente`, `enviarWhatsappLead`, `enviarWhatsappSocio`, `enviarDocumentoWhatsapp`, `enviarMensagemPortal`, `enviarComunicadoSegmentado`, `enviarCobrancaInadimplente`, `enviarLembreteVencimento`, `enviarNotaFiscalCliente`, `reativarCliente`, `transferirCliente`

### NFS-e Spedy (5 tools — JÁ IMPLEMENTADAS)
`emitirNotaFiscal`, `consultarNotasFiscais`, `reemitirNotaFiscal`, `cancelarNotaFiscal`, `verificarConfiguracaoNfse`

### Cobrança Asaas (3 tools)
`gerarSegundaViaAsaas`, `buscarCobrancaAberta`, `gerarRelatorioInadimplencia`

### Agendamentos (3 tools)
`criarAgendamento`, `listarAgendamentos`, `cancelarAgendamento`

### Escalação/Suporte (2 tools)
`responderEscalacao`, `convidarSocioPortal`

### IA/Análise (3 tools)
`resumirDocumento`, `classificarEmail`, `resumoFunil`

### Relatórios/Misc (3 tools)
`publicarRelatorio`, `resumoDashboard`, `buscarCnpjExterno`

### Receita Federal — DAS MEI (2 tools — adicionadas em v3.10.27)
`consultarDASMEI` (lista DAS armazenadas com status/código/link), `enviarDASMEICliente` (envia código de barras + urlDas ao cliente via WhatsApp/email)

## Toggle de tools por escritório

- Campo `toolsDesabilitadas Json?` em `Escritorio` → array de nomes de tools desabilitadas
- Carregado via `getAiConfig()` com cache 60s
- Aplicado em `executarAgente()` antes de montar `toolDefinitions`
- UI: aba "Ferramentas" em `/crm/configuracoes/ia` com toggles agrupados por categoria
- API: `GET /api/agente/tools` (admin/contador) + `PUT /api/agente/tools` (admin only)

## Agendamentos (`AgendamentoAgente` model)

```
id, descricao, cron (expressão cron), instrucao (o que a IA deve fazer),
ativo, criadoPorId, criadoPorNome, ultimoDisparo, proximoDisparo
```

- `croner` library para parse e validação de expressões cron
- `proximoDisparo()` e `validarCron()` em `src/lib/ai/cron-helper.ts`
- Endpoint `POST /api/agente/cron` — chamado pelo crontab da VPS a cada minuto
  - Valida `CRON_SECRET` no header `x-cron-secret`
  - Busca agendamentos ativos com `proximoDisparo <= now`
  - Executa cada um via `executarAgente()` com `solicitante: 'cron'`
  - Atualiza `ultimoDisparo` e `proximoDisparo`

**Configuração na VPS (crontab):**
```
*/1 * * * * curl -s -X POST https://seudominio/api/agente/cron -H "x-cron-secret: $CRON_SECRET"
```

## Log de ações (`AgenteAcao` model)

Cada execução de tool é registrada com:
- `tool`, `input`, `resultado`, `sucesso`
- `solicitanteAI`, `usuarioId`, `usuarioNome`, `usuarioTipo`
- `clienteId`, `leadId`, `criadoEm`

Visível em `/crm/configuracoes/ia/log`.

## Migrations incluídas

- `20260327000003_agente_acao_usuario` — campos usuarioNome/usuarioTipo em AgenteAcao
- `20260327000004_agendamento_agente` — model AgendamentoAgente
- `20260327000005_tools_desabilitadas` — campo toolsDesabilitadas em Escritorio
- `20260327000006_mensagem_ia_media` — campos de mídia em MensagemIA
