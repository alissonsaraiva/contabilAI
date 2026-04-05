# NFSE — Notas Fiscais de Serviço

> **Sistema:** AVOS v3.10.23 | **Fonte:** `SISTEMA.md` (extraído)

---

## Fluxo Via CRM / IA / Agente

```
1. Operador/IA executa emitirNotaFiscal()
2. Validação: empresa tem Spedy configurado?
3. POST para API Spedy com dados do tomador
4. NotaFiscal criada no banco com status: enviando
5. Spedy processa (SEFAZ/prefeitura)
6. Webhook /api/webhooks/spedy/[token]:
   └── autorizada → atualiza status, salva numero/xml/pdf URLs
   └── rejeitada → registra erro, permite reemissão
7. Se autorizada: onNotaAutorizada()
   a. Salva PDF+XML no R2 (backup local — R2-first, Spedy fallback)
   b. Indexa no RAG com status "Autorizada"
   c. Notifica equipe CRM
   d. Se spedyEnviarAoAutorizar = true → entregarNotaCliente(canal)
      └── WhatsApp: texto + PDF + XML (retry 3x com backoff 2s)
      └── Email: assunto + PDF + XML em anexo
      └── Portal: Chamado visível no portal (visivelPortal: true) +
                  nota disponível em /portal/notas-fiscais (PDF e XML)
8. Portal: badge "NFS-e" no header conta notas autorizadas nos últimos 30 dias
```

## Fluxo Via Portal do Cliente (auto-serviço — v3.10.21)

```
1. Cliente acessa /portal/notas-fiscais
2. Dados da empresa (prestador) pré-preenchidos
3. Cliente preenche: descrição, valor, dados do tomador (nome, CPF/CNPJ, email, município, estado)
4. POST /api/portal/notas-fiscais → emitirNotaFiscal() + marca solicitadaPeloPortal: true
5. Mesma fila Spedy do fluxo CRM — webhook e reconciliação idênticos
6. Nota aparece imediatamente na lista com status "Enviando" → polling automático a cada 6s
7. Equipe notificada por WhatsApp/email via notificarEquipeNfsSolicitadaPortal()
8. No CRM: badge "Portal" em azul identifica notas originadas pelo cliente
```

- **Acesso**: apenas clientes PJ com Spedy configurado; PF é redirecionado ao dashboard
- **Campo de auditoria**: `solicitadaPeloPortal: true` no banco

## Cancelamento via Portal

```
1. Cliente clica no ícone de cancelamento em nota autorizada
2. Informa justificativa (mín. 15 chars)
3. POST /api/portal/notas-fiscais/[id]/cancelar → cancelarNotaFiscal()
4. Validações: ownership (clienteId), status = autorizada, prazo ≤ 30 dias desde autorização
5. Se prazo > 30 dias: bloqueia com mensagem + orienta abrir chamado
6. Se aceito: cancela na Spedy → marca cancelada + notifica equipe + re-indexa RAG com status "Cancelada"
```

## Reemissão via Portal

```
1. Cliente vê nota com status "Rejeitada" ou "Erro interno"
2. Clica no ícone de reemissão → modal com dados pré-preenchidos para correção
3. POST /api/portal/notas-fiscais/[id]/reemitir → reemitirNotaFiscal() com overrides
4. Nova nota entra na fila Spedy normalmente
```

## Rotas CRM

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/crm/notas-fiscais` | GET/POST | Listar / emitir |
| `/api/crm/notas-fiscais/municipios` | GET | Municípios suportados Spedy |
| `/api/crm/notas-fiscais/[id]` | GET/PUT | Detalhe / atualizar rascunho |
| `/api/crm/notas-fiscais/[id]/pdf` | GET | Download PDF |
| `/api/crm/notas-fiscais/[id]/xml` | GET | Download XML |
| `/api/crm/notas-fiscais/[id]/cancelar` | POST | Cancelar na SEFAZ |
| `/api/crm/notas-fiscais/[id]/reemitir` | POST | Reemitir |
| `/api/crm/notas-fiscais/[id]/entregar` | POST | Enviar ao cliente |

## Rotas Portal

| Rota | Auth | Descrição |
|------|------|-----------|
| `/api/portal/notas-fiscais` | Portal session | Listar NFS-e (GET) / Emitir nova NFS-e (POST) |
| `/api/portal/notas-fiscais/[id]` | Portal session | Detalhe da nota (GET) |
| `/api/portal/notas-fiscais/[id]/cancelar` | Portal session | Cancelar nota autorizada (POST) |
| `/api/portal/notas-fiscais/[id]/reemitir` | Portal session | Reemitir nota rejeitada/erro (POST) |
| `/api/portal/notas-fiscais/[id]/pdf` | Portal session | Download PDF (R2-first → Spedy fallback) |
| `/api/portal/notas-fiscais/[id]/xml` | Portal session | Download XML (R2-first → Spedy fallback) |

## Integração Spedy

- **Auth**: header `X-Api-Key` (não `Authorization`)
- **Webhook token**: SHA-256 da API key → `/api/webhooks/spedy/[token]`
- **Ponto de falha**: Webhook pode chegar fora de ordem; cron de reconciliação atua como fallback
- **Limite de paginação**: `pageSize` máximo = **100** por página (API rejeita valores maiores)
- **Arquivo principal**: `src/lib/services/notas-fiscais.ts`, `src/lib/services/nfse/`

### Reconciliação (cron `0 * * * *`)

Rota: `/api/cron/reconciliar-notas` — dois batches:
- **Batch 1**: notas em `enviando` sem `spedyId` há >10 min → marca `erro_interno` + abre chamado
- **Batch 2**: notas em `enviando`/`processando` com `spedyId` há >10 min → consulta status atual na Spedy via `consultarNfse`, repassa para `processarWebhookSpedy`; ID determinístico (`reconciliacao-{notaId}-{spedyId}`) garante idempotência

### Endpoints Spedy — Comportamento Validado (sandbox 2026-04-03)

| Endpoint | Método | Body | Observação |
|----------|--------|------|-----------|
| `/service-invoices` | POST | JSON completo | `taxationType` aceito: `taxationInMunicipality`, `exemptFromTaxation`, `notSubjectToTaxation`, `taxationOutsideMunicipality` |
| `/service-invoices/{id}` | GET | — | `processingDetail` é `null` quando status = `enqueued`; usar `?.` |
| `/service-invoices/{id}` | DELETE | `{ Reason: string }` | Campo é `Reason` (maiúsculo); `justification` é rejeitado |
| `/service-invoices/{id}/issue` | POST | `{}` | Body vazio `{}` obrigatório; sem body retorna 400 |
| `/service-invoices/{id}/check-status` | POST | — | Funciona sem body |
| `/service-invoices/{id}/pdf` | GET | — | Não exige `X-Api-Key`; retorna 400 se nota não estiver `authorized` |
| `/service-invoices/{id}/xml` | GET | — | Idem PDF |
| `/service-invoices/cities` | GET | — | `pageSize` máx 100; resposta usa chave `items` (não `data`) |
| `/companies` | GET/POST | — | `taxRegime` pode retornar `null`; `apiCredentials.apiKey` vem mascarado na listagem |
| `/webhooks` | GET | — | Resposta: `{ items: SpedyWebhook[] }` |

### Campos da Resposta — Divergências com Interface TypeScript

| Campo API | Interface TS | Observação |
|-----------|-------------|-----------|
| `number: 0` | `number \| null` | API retorna `0` (não `null`) quando nota ainda não tem número — usar `\|\| null` ao salvar |
| `rps.number: 0` | `number` | Idem — `0` = ainda não protocolado |
| `rps.series: null` | `string` | Pode ser `null` |
| `processingDetail.on` | não mapeado | Campo extra na resposta, ignorado sem impacto |
| `authorization.date/protocol: null` | `string` | Null quando não autorizado ainda |

### Municípios CE (sandbox)

15 cidades: Aquiraz, Eusébio, Fortaleza, Horizonte, Ipu, Jaguaruana, Juazeiro do Norte, Missão Velha, Pacajus, Russas, Sobral, Tianguá, Ubajara, Viçosa do Ceará, Várzea Alegre

### Webhook Spedy (produção, obrigatório)

`GET /api/crm/configuracoes/spedy/webhook` — checa se está registrado/ativo na Spedy; `POST` — registra ou reativa. Sem webhook, autorizações chegam apenas via cron (latência de até 1h). Registrar uma única vez por conta Owner.

## Arquitetura de Componentes — Portal NFS-e (v3.10.21)

`portal-notas-fiscais-client.tsx` refatorado de ~875 linhas para ~140 linhas como thin orchestrator.

Lógica extraída para `src/components/portal/notas-fiscais/` com 6 arquivos especializados:

| Arquivo | Responsabilidade |
|---------|----------------|
| `_shared.ts` | Tipos, constantes, helpers |
| `_modal.tsx` | Primitivos genéricos de modal |
| `nota-card.tsx` | Card com banners e ações |
| `nfse-form-fields.tsx` | Campos do formulário compartilhados entre emissão e reemissão |
| `modal-emitir.tsx` | Modal de emissão com estado próprio |
| `modal-cancelar.tsx` | Modal de cancelamento com estado próprio |
| `modal-reemitir.tsx` | Modal de reemissão com estado próprio |

## Comportamentos do Portal

- **Polling automático**: UI faz polling a cada 6s enquanto há notas em `enviando`/`processando` — para automaticamente
- **Filtro de status**: inclui `enviando`, `processando`, `rejeitada`, `erro_interno` — notas recém-emitidas aparecem imediatamente
- **Filtro de mês**: usa `criadoEm` (não `autorizadaEm`) para funcionar com todos os status
- **Badge "NFS-e" no header**: conta notas autorizadas nos últimos 30 dias
- **Badge "Portal" no CRM**: card exibe badge azul quando `solicitadaPeloPortal = true`
- **Download PDF/XML**: R2-first → Spedy fallback; garante download mesmo se Spedy offline
- **Backup no R2**: `salvarPdfXmlNoR2()` em `src/lib/services/nfse/backup.ts` — chamado ao autorizar

## Notificações

- `notificarEquipeNfsSolicitadaPortal()` — när cliente emite via portal
- `notificarEquipeNfsCanceladaPeloPortal()` — quando cliente cancela via portal
- Fonte: `src/lib/services/nfse/notificacoes.ts` — disparo assíncrono (não bloqueia resposta ao cliente)

## Reenvio de E-mail ao Tomador

`POST /api/crm/notas-fiscais/[id]/reenviar-email` — chama `POST /service-invoices/{id}/resend-email` na Spedy. Requer nota `autorizada` + `tomadorEmail` preenchido. Tool IA: `reenviarEmailNotaFiscal`.

## Cobertura de Município

`GET /api/crm/clientes/[id]/spedy` retorna `municipioIntegrado: boolean | null`. Estratégia:
1. Se cliente tem CEP → ViaCEP → código IBGE → `verificarMunicipio(ibge)` (match exato)
2. Fallback: scan paginado por nome normalizado com cache 24h por UF
3. Apenas informativo — não bloqueia emissão

## hook useCep

`src/hooks/use-cep.ts` — auto-fill de endereço via ViaCEP ao digitar 8 dígitos do CEP.  
Retorna: `{ logradouro, bairro, cidade, uf, cep, ibge }`  
Usado em: `novo-cliente-drawer.tsx`, `editar-cliente-drawer.tsx`, `portal-contato-edit.tsx`
