# DOCUMENTOS — Gerenciamento de Documentos e Notificações

> **Sistema:** AVOS v3.10.38 | **Fonte:** revisão geral do código

---

## Service `criarDocumento` (`src/lib/services/documentos.ts`)

Ponto de entrada único para toda criação de `Documento`, independente da origem:

```
Origens suportadas:
  crm         → contador envia via CRM
  portal      → cliente faz upload pelo portal
  integracao  → integração externa (NFe, ERP, etc.)
  whatsapp    → recebido via mensagem WA
  email       → anexo de email recebido

Fluxo:
1. Upload S3 (se buffer fornecido) → key por vínculo: empresa > cliente > lead
2. Parse XML automático (NFe, CT-e, NFS-e) → extrai metadata
3. Resolução de categoria: explícita > inferida do XML > 'geral'
4. Status default: 'aprovado' para crm/integracao | 'pendente' para portal
5. visivelPortal: default true — se false, documento é interno (não aparece no portal)
6. Auto-fill empresaId a partir do clienteId (documentos PJ aparecem na empresa)
7. Cria registro no banco com todos os vínculos
8. indexarAsync('documento') → RAG (fire-and-forget)
9. resumirDocumentoAsync(documentoId) → resumo IA + re-indexa (fire-and-forget)
```

**Retorna**: `{ id, url, nome, categoria, xmlMetadata }`

## Modelo `Documento` — Campos Principais

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `visivelPortal` | `Boolean` (default: `true`) | Se `false`, documento é interno — não aparece no portal do cliente |
| `nome` | `String` | Nome do arquivo — editável via PATCH pelo operador |
| `tipo` | `String` | Descrição livre (ex: "Guia DAS", "Nota Fiscal") |
| `categoria` | `CategoriaDocumento` | Enum: geral, nota_fiscal, imposto_renda, guias_tributos, relatorios, outros |
| `status` | `String` | pendente, aprovado, rejeitado, enviado, **vencido** |
| `observacao` | `String?` | Nota interna do operador |
| `origem` | `String` | crm, portal, integracao, whatsapp, email |
| `resumoStatus` | `String` | pendente, processando, ok, falhou, esgotado |
| `dataVencimento` | `DateTime?` | Data de vencimento (guias, certidões, procurações) |
| `lembrete5dEnviadoEm` | `DateTime?` | Lembrete 5 dias antes enviado em |
| `lembreteDiaEnviadoEm` | `DateTime?` | Lembrete no dia do vencimento enviado em |

## Categorias de Documento (`CategoriaDocumento`)

Enum Prisma. Categorias comuns inferidas do XML:
- `NFe`, `NFC-e`, `NFS-e` → `nota_fiscal`
- `CT-e` → `relatorios`
- Demais → `geral`

## Rotas CRM

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/crm/clientes/[id]/documentos` | POST | Upload de documento (aceita `visivelPortal` no form) |
| `/api/crm/clientes/[id]/documentos` | GET | Listar docs do cliente (inclui empresa se PJ) |
| `/api/crm/documentos` | GET | Picker genérico — busca cross-client |
| `/api/crm/documentos/[id]` | PATCH | Edição parcial: nome, tipo, categoria, status, visivelPortal, observacao |
| `/api/crm/documentos/[id]` | DELETE | Soft-delete + deindex RAG + remove S3 |
| `/api/crm/documentos/[id]/download` | GET | Download com URL assinada R2 |
| `/api/crm/documentos/backfill-resumos` | POST | Admin: (re)processar resumos IA pendentes |

### PATCH `/api/crm/documentos/[id]`

Campos editáveis (todos opcionais no body JSON):
- `nome` (string) — renomear o documento
- `tipo` (string) — alterar descrição
- `categoria` (enum) — reclassificar
- `status` (string) — mudar status
- `visivelPortal` (boolean) — toggle de visibilidade no portal
- `observacao` (string) — nota interna

Re-indexa RAG automaticamente se nome/tipo/categoria mudaram.

## Rotas Portal

| Rota | Auth | Descrição |
|------|------|-----------|
| `/api/portal/documentos/upload` | Portal session | Upload pelo cliente (classificação IA + limite 10MB) |
| `/api/portal/documentos/[id]/download` | Portal session | Download com URL assinada R2 |
| `/api/portal/documentos/[id]/visualizar` | Portal session | Marca como visualizado pelo cliente |

**Visibilidade no portal**: a query filtra `visivelPortal: true` + `deletadoEm: null`. Documentos marcados como internos no CRM nunca aparecem para o cliente.

## Componentes CRM — Documentos

### `DocumentosTabContent` (`src/components/crm/documentos-tab-content.tsx`)
Componente principal da aba de documentos. Recursos:
- **Agrupamento por ano/mês** (ex: "Abril 2026", "Março 2026")
- **Filtros**: busca por nome/tipo, categoria, origem, status, **visibilidade no portal** (Visível/Interno)
- **Resumo**: "X documentos · Y internos · Z não vistos pelo cliente"
- **Seleção múltipla**: checkbox por doc e por grupo (mês), com estado indeterminate
- **Ações em lote** (DocumentoBulkActions): excluir, disponibilizar no portal, tornar interno
- **Modais**: edição completa (DocumentoEditModal) e preview inline (DocumentoPreviewModal)

### `DocumentoRow` (`src/components/crm/documento-row.tsx`)
Linha individual de documento. Ações rápidas:
- **Checkbox de seleção** para ações em lote
- **Renomear inline**: clique no nome → input editável → Enter salva, Esc cancela
- **Toggle visibilidade**: ícone olho (visibility/visibility_off) com feedback otimista
- **Badge "Não visto"**: indica docs enviados pelo escritório que o cliente ainda não visualizou
- **Preview**: ícone preview para PDFs e imagens (abre modal com iframe/img)
- **Download**: link direto para download
- **Editar**: abre modal de edição completa
- **Deletar**: com confirmação em dois passos

### `DocumentoBulkActions` (`src/components/crm/documento-bulk-actions.tsx`)
Barra de ações em lote (aparece quando há seleção):
- Contador de selecionados, selecionar todos, limpar seleção
- **Disponibilizar no portal** (bulk PATCH visivelPortal: true)
- **Tornar interno** (bulk PATCH visivelPortal: false)
- **Excluir** com confirmação em dois passos
- Concorrência limitada a 5 requests simultâneos

### `DocumentoEditModal` (`src/components/crm/documento-edit-modal.tsx`)
Modal para edição completa: nome, tipo, categoria, status, observação, checkbox visivelPortal.

### `DocumentoPreviewModal` (`src/components/crm/documento-preview-modal.tsx`)
Modal de preview inline para PDFs (iframe) e imagens (img). Botão para abrir em nova aba.

### `DocumentoUpload` (`src/components/crm/documento-upload.tsx`)
Upload de documentos — usado tanto na aba do cliente (PF e PJ) quanto na página da empresa:
- **Upload em lote**: selecionar múltiplos arquivos de uma vez
- **Drag & drop**: arrastar arquivos para a drop zone
- **Concorrência limitada**: 3 uploads simultâneos
- **Progress individual**: status por arquivo (pending/uploading/done/error)
- **Checkbox "Portal"**: controla `visivelPortal` para todo o lote
- **Validação client-side**: extensão e tamanho (25 MB)
- **Retry**: arquivos que falharam podem ser reenviados
- **empresaId opcional**: PJ passa empresaId, PF não — o service auto-resolve

## Vencimento de Documentos

Documentos com `dataVencimento` (guias de imposto, certidões, procurações) recebem tratamento automático:

**Fluxo:**
1. Operador define `dataVencimento` no upload ou edição do documento
2. CRM exibe badge visual: "Vence em Xd" (verde >15d, azul 6-15d, laranja 1-5d, vermelho hoje/vencido)
3. Cron diário (`lembrete-documentos`, 9h) envia 2 lembretes: 5 dias antes + no dia
4. Cron marca `status = 'vencido'` para documentos já expirados

**Cron:** `/api/cron/lembrete-documentos` (diário 0 9 * * *)
- **Lembrete D-5**: docs com vencimento em 5 dias + `lembrete5dEnviadoEm = null`
- **Lembrete D-0**: docs com vencimento hoje + `lembreteDiaEnviadoEm = null`
- **Marca vencidos**: docs com `dataVencimento < hoje` + `status != 'vencido'`
- Notificação: `notificarDocumentoVencendo()` → sino do CRM para equipe de atendimento
- Healthcheck: `HC_LEMBRETE_DOCUMENTOS`
- Batch: max 50 docs por etapa

**Ao alterar vencimento via PATCH**: campos `lembrete5dEnviadoEm` e `lembreteDiaEnviadoEm` são resetados para que novos lembretes sejam enviados.

## Resumo IA de Documentos (`src/lib/services/resumir-documento.ts`)

- Extrai texto de PDFs e documentos
- IA (Claude) gera resumo + classificação
- `cron/retry-documentos` (`0 * * * *`) — retry para documentos com `resumoStatus = 'falhou'`
- Após 3 falhas: `notificarDocumentoFalhou()` → abre Chamado automático e notifica equipe

## Sistema de Notificações (`src/lib/notificacoes.ts`)

Helpers para criar notificações no sino do CRM. Anti-spam: cooldown de 10 min por tipo+chave.

| Função | Visibilidade | Trigger |
|--------|-------------|---------|
| `notificarIaOffline(provider, erro)` | Admins | Provider IA cai |
| `notificarAgenteFalhou(erro)` | Admins | Todos os providers esgotados |
| `notificarDocumentoEnviado(clienteId, nomeArquivo)` | Equipe atendimento | Cliente faz upload pelo portal |
| `notificarEscalacaoPortal(clienteId, escalacaoId)` | Equipe atendimento | Cliente solicita humano pelo portal |
| `notificarClienteInadimplente(opts)` | Equipe atendimento | PAYMENT_OVERDUE do Asaas; 2 camadas anti-spam (in-memory + DB para multi-instância) |
| `notificarDocumentoFalhou(opts)` | Equipe atendimento | Resumo IA falhou 3x; abre Chamado automático se houver clienteId |
| `notificarDocumentoVencendo(opts)` | Equipe atendimento | Documento próximo do vencimento (D-5 ou D-0); cooldown por doc+dias |

**Tipos de usuário por audiência**:
- Admins: `tipo = 'admin'`
- Equipe de atendimento: `tipo IN ('admin', 'contador', 'assistente')`

## Sistema de Histórico (`src/lib/historico.ts`)

Activity log central — escrita fire-and-forget (nunca bloqueia o caminho crítico).

Funções exportadas:
- `registrarHumanoAssumiu()` — operador assume conversa WA
- `registrarIaRetomada()` — conversa devolvida para IA
- `registrarAgenteExecutou()` — tool do agente executada (sucesso/falha)
- `registrarMudancaStatus()` — cliente ou lead muda de status
- `registrarNota()` — interação manual (compatível com `NovaInteracaoDrawer`)
- `registrarClienteCriado()` — cliente novo criado

**Como adicionar novo tipo de evento** (sem migration):
1. Adicionar string ao union `TipoEvento` em `historico-config.ts`
2. Adicionar entrada em `EVENTO_CONFIG` com icon e label
3. Criar função `registrar<SuaFeature>()` exportada
4. Chamar onde necessário — uma linha, sem `.catch()`

## Hook useCnpj (`src/hooks/use-cnpj.ts`)

Auto-fill via consulta pública de CNPJ ao digitar 14 dígitos. Complementa o `useCep`.

## Hook useMobile (`src/hooks/use-mobile.ts`)

Detecção de breakpoint mobile para exibição condicional de elementos responsivos.

## Comunicados (`/crm/comunicados`)

Publicações do escritório visíveis no portal do cliente. A tool `publicarComunicado` permite que a IA publique comunicados segmentados por plano/status.

### Rotas de API

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/crm/comunicados` | GET/POST | Listar / criar comunicado |
| `/api/crm/comunicados/[id]` | GET/PATCH/DELETE | Detalhe, publicar/despublicar, excluir |
| `/api/portal/comunicados` | GET | Comunicados visíveis ao cliente autenticado |

### Página CRM (`src/app/(crm)/crm/comunicados/page.tsx`)

Server Component com filtros via `searchParams`. Parâmetros aceitos:

| Param | Valores | Default |
|-------|---------|---------|
| `secao` | `ativos` \| `expirados` \| `rascunhos` | `ativos` |
| `tipo` | `informativo` \| `alerta` \| `obrigacao` \| `promocional` | — (todos) |
| `busca` | string | — |
| `pagina` | número inteiro ≥ 1 | `1` |

**Lógica de seções:**
- `ativos` — `publicado: true` AND (`expiradoEm IS NULL` OR `expiradoEm >= agora`)
- `expirados` — `publicado: true` AND `expiradoEm < agora`
- `rascunhos` — `publicado: false`

**Paginação:** 20 por página, server-side. Counters das tabs são independentes dos filtros de tipo/busca — mostram o total da seção.

**Agrupamento:** resultados são agrupados por ano (`criadoEm`) dentro de cada seção.

**Alcance:** cada card mostra quantos emails foram disparados via `_count.envios` (total de `ComunicadoEnvio` criados — inclui pendentes e falhos).

### Componentes

| Componente | Tipo | Função |
|------------|------|--------|
| `ComunicadosFiltros` | Client | Tabs de seção + chips de tipo + busca com debounce 400ms. Input controlado (`useState` + `useEffect`). Timer com cleanup ao desmontar. |
| `ComunicadosPaginacao` | Client | Navegação primeira/anterior/próxima/última + contador "X–Y de N". Oculto se há apenas 1 página. |
| `ComunicadoForm` | Client | Formulário de criação: título, conteúdo, tipo, expiração, anexo (upload ou doc do sistema), opção de publicar + enviar email. |
| `ComunicadoPublishButton` | Client | Abre modal com opção de segmentação de email por status do cliente (ativo/inadimplente/suspenso). |
| `ComunicadoUnpublishButton` | Client | Despublica com loading state. |
| `ComunicadoDeleteButton` | Client | Confirma via `ConfirmDialog` antes de excluir. |

### Tipos (`enum TipoComunicado`)

`informativo` · `alerta` · `obrigacao` · `promocional`

### Schema relevante

```
Comunicado         → publicado, publicadoEm, expiradoEm, tipo, anexoUrl/anexoNome
ComunicadoEnvio    → comunicadoId, clienteId, email, status (pendente|enviado|falhou)
```

## PDF e Contratos (`src/lib/pdf/`)

- `contrato-template.tsx` — template React → PDF do contrato do cliente (dados reais do lead + escritório)
- `contrato-variaveis.ts` — variáveis disponíveis no template
- `relatorio-template.tsx` — template de relatório gerado pelo agente via `publicarRelatorio`

## Relatórios (`/api/relatorios`)

| Rota | Método | Auth | Descrição |
|------|--------|------|-----------|
| `/api/relatorios` | GET | CRM | Listar relatórios gerados pelo agente |
| `/api/relatorios/[id]` | GET | CRM | Detalhe do relatório |
| `/api/relatorios/[id]/pdf` | GET | CRM | Download do PDF do relatório |
