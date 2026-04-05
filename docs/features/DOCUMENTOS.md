# DOCUMENTOS — Gerenciamento de Documentos e Notificações

> **Sistema:** AVOS v3.10.23 | **Fonte:** revisão geral do código

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
5. Auto-fill empresaId a partir do clienteId (documentos PJ aparecem na empresa)
6. Cria registro no banco com todos os vínculos
7. indexarAsync('documento') → RAG (fire-and-forget)
8. resumirDocumentoAsync(documentoId) → resumo IA + re-indexa (fire-and-forget)
```

**Retorna**: `{ id, url, nome, categoria, xmlMetadata }`

## Categorias de Documento (`CategoriaDocumento`)

Enum Prisma. Categorias comuns inferidas do XML:
- `NFe`, `NFC-e`, `NFS-e` → `nota_fiscal`
- `CT-e` → `relatorios`
- Demais → `geral`

## Rotas CRM

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/crm/documentos` | GET/POST | Listar / upload de documento |
| `/api/crm/documentos/[id]` | GET/PATCH/DELETE | Detalhe, editar, soft-delete |
| `/api/crm/documentos/[id]/download` | GET | Download com URL assinada R2 |
| `/api/crm/documentos/backfill-resumos` | POST | Admin: (re)processar resumos IA pendentes |

## Rotas Portal

| Rota | Auth | Descrição |
|------|------|-----------|
| `/api/portal/documentos` | Portal session | Listar documentos do cliente |
| `/api/portal/documentos/[id]/download` | Portal session | Download com URL assinada R2 |

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

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/crm/comunicados` | GET/POST | Listar / criar comunicado |
| `/api/crm/comunicados/[id]` | GET/PATCH/DELETE | Detalhe, editar, despublicar |
| `/api/portal/comunicados` | GET | Comunicados visíveis ao cliente |

Comunicados são publicações do escritório visíveis no portal do cliente. A tool `publicarComunicado` permite que a IA publique comunicados segmentados por plano/status.

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
