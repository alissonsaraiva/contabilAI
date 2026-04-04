# AVOS — Documentação Completa do Sistema
> **Gerado em**: 2026-04-03 | **Versão**: v3.10.16 | **Fonte da verdade**: código-fonte

---

## 📌 Visão Geral

**AVOS** (rebrandeado de ContabAI em 2026-03-30) é uma plataforma SaaS de gestão para escritórios de contabilidade. O sistema tem três faces:

1. **CRM interno** — usado por contadores e assistentes para gerir clientes, leads, finanças, documentos, notas fiscais e atendimentos
2. **Portal do cliente** — acesso autenticado via magic link ou OTP para clientes verem cobranças, documentos, NFS-e, chamados e conversar com a IA "Clara"
3. **Onboarding público** — widget conversacional que captura prospects, recomenda planos e inicia o fluxo de contratação

### Principais responsabilidades

- Gestão completa de leads → clientes (funil de onboarding com IA)
- Cobrança recorrente integrada com Asaas (PIX e boleto — cartão fora do escopo)
- Emissão de NFS-e via Spedy com entrega multicanal
- IA conversacional em 4 canais: WhatsApp, onboarding, CRM e portal
- 59 tools operacionais executáveis pela IA do CRM
- RAG (Retrieval-Augmented Generation) com busca híbrida (embeddings + full-text)
- Sistema de emails com inbox IMAP e threading completo
- Assinatura eletrônica de contratos (Zapsign / Clicksign / DocuSeal)
- Portal PWA com web push notifications

---

## 🏗️ Arquitetura

### Stack Técnica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Framework | Next.js (App Router) | 16.2.1 |
| UI | React + Tailwind CSS 4 | 19.2.4 |
| ORM | Prisma | 7.5.0 |
| Banco | PostgreSQL 17 + pgvector 0.8.2 | — |
| Linguagem | TypeScript | 5.x |
| IA | Claude Haiku 4.5 (padrão) + OpenAI/Groq/Gemini | — |
| Storage | Cloudflare R2 (S3-compatible) | — |
| Deploy | Docker + VPS (6 containers) via ghcr.io | — |
| Monitoramento | Sentry (client + server + edge) + healthchecks.io (crons) | — |
| Auth CRM | NextAuth.js (credentials) | — |
| Auth Portal | Magic link + OTP WhatsApp + sessions | — |

### Camadas do Sistema

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                   │
│   CRM (crm.avos.digital)  │  Portal (portal.avos.digital) │
│   Onboarding (widget)     │  Landing (avos.digital)      │
├─────────────────────────────────────────────────────────┤
│                 API ROUTES (Next.js)                    │
│   /api/crm/**  │  /api/portal/**  │  /api/webhooks/**   │
│   /api/whatsapp/webhook  │  /api/cron/**                │
├─────────────────────────────────────────────────────────┤
│                   SERVIÇOS (src/lib/)                   │
│   ai/  │  email/  │  whatsapp/  │  rag/  │  services/   │
├─────────────────────────────────────────────────────────┤
│                   BANCO DE DADOS                        │
│   PostgreSQL 17 (porta 32768 na VPS)                   │
│   pgvector 0.8.2 para embeddings RAG                   │
├─────────────────────────────────────────────────────────┤
│               INTEGRAÇÕES EXTERNAS                      │
│  Asaas │ Spedy │ Evolution API │ Zapsign │ Clicksign     │
│  DocuSeal │ SERPRO │ Cloudflare R2 │ Anthropic API      │
└─────────────────────────────────────────────────────────┘
```

### Roteamento por Subdomínio

**Arquivo**: `src/proxy.ts` (⚠️ NÃO usar `src/middleware.ts` — causa build error)

- `crm.avos.digital` → rewrite para `/(crm)/...`
- `portal.avos.digital` → rewrite para `/(portal)/...`
- `avos.digital` → landing/onboarding público

### Padrões de Projeto

- **Server Components** — páginas carregam dados no servidor por padrão
- **Client Components** — `"use client"` apenas onde há interatividade
- **Route Handlers** — toda lógica de negócio em `/api/**`
- **Try/Catch obrigatório** — todo código deve ter tratamento de erro explícito
- **Sentry em toda operação crítica** — `Sentry.captureException()` em todos os `catch`
- **Migrations via Prisma** — NUNCA `db push`, sempre `migrate dev --name <nome>`

---

## 📁 Estrutura de Pastas

```
contabilAI/
├── prisma/
│   ├── schema.prisma          # Schema unificado (~1010 linhas, 31+ modelos)
│   ├── migrations/            # 36+ arquivos SQL (histórico desde v1.0)
│   ├── seed.ts                # Seed de planos iniciais
│   └── init-vectors.sql       # Setup pgvector + índices HNSW
├── scripts/
│   └── migrate-vectors-canal.sql  # Migração de canal no RAG
├── docs/
│   ├── ia-arquitetura.md      # Documentação legacy da IA
│   └── SISTEMA.md             # Este arquivo (atualizado)
├── src/
│   ├── app/
│   │   ├── (crm)/crm/         # Interface do CRM (autenticada)
│   │   ├── (portal)/portal/   # Portal do cliente (magic link / OTP)
│   │   ├── (onboarding)/      # Widget público de onboarding
│   │   └── api/               # Todas as route handlers
│   ├── components/
│   │   ├── crm/               # 70+ componentes do CRM
│   │   ├── portal/            # 12+ componentes do portal
│   │   └── ui/                # Shadcn/ui + customizações
│   ├── hooks/                 # Custom React hooks
│   ├── lib/
│   │   ├── ai/                # IA: providers, tools, agente, RAG, conversa
│   │   │   ├── agent.ts       # Agente operacional (loop de tool calling)
│   │   │   ├── ask.ts         # Chat simples com contexto
│   │   │   ├── config.ts      # Configuração de providers
│   │   │   ├── classificar-intencao.ts  # Classificador de intenção
│   │   │   └── tools/         # 38+ tool definitions
│   │   ├── email/
│   │   │   ├── imap.ts        # Recebimento IMAP (imapflow)
│   │   │   ├── send.ts        # Envio SMTP (nodemailer + Resend)
│   │   │   ├── processar.ts   # Pipeline de processamento
│   │   │   └── com-historico.ts  # Threading de emails
│   │   ├── whatsapp/
│   │   │   ├── constants.ts   # Limites, rate limit, padrões
│   │   │   ├── identificar-contato.ts  # Cliente/lead/sócio/prospect
│   │   │   ├── arquivar-midia.ts       # Salvar mídia no R2
│   │   │   ├── processar-pendentes.ts  # Processar fila de mensagens
│   │   │   └── pipeline/      # Etapas do pipeline de processamento
│   │   ├── rag/
│   │   │   ├── ingest.ts      # Indexação de documentos
│   │   │   └── ingestores/    # 8 ingestores especializados
│   │   ├── services/
│   │   │   ├── asaas-sync.ts  # Sincronização de cobranças Asaas
│   │   │   ├── interacoes.ts  # Registro de interações no feed
│   │   │   ├── notas-fiscais.ts  # Emissão NFS-e Spedy
│   │   │   ├── chamados.ts    # Orquestrador de resolução de chamado
│   │   │   ├── classificar-documento.ts  # IA classifica docs
│   │   │   └── nfse/          # Módulo completo de NFS-e
│   │   ├── schemas/           # Schemas Zod de validação
│   │   ├── utils/
│   │   │   └── phone.ts       # Normalização de números telefone
│   │   ├── asaas.ts           # Client da API Asaas
│   │   ├── event-bus.ts       # EventEmitter para comunicação interna
│   │   └── rag/ingest.ts      # Orquestrador de ingestão RAG
│   ├── types/                 # TypeScript types globais
│   ├── proxy.ts               # Middleware de subdomínio (USAR ESTE)
│   ├── middleware.ts           # ⚠️ DESCONTINUADO — não tocar
│   └── instrumentation*.ts    # Setup Sentry (client/server/edge)
├── .env.example               # Template de variáveis
├── next.config.ts             # Config Next.js (Sentry, CSP, headers)
├── sentry.*.config.ts         # Sentry por ambiente
├── CLAUDE.md → AGENTS.md      # Regras para agentes de IA
└── package.json               # v0.1.0 (nome interno)
```

---

## 🔄 Fluxos Principais

### 1. Fluxo de Onboarding (Lead → Cliente)

#### Visão geral das etapas

```
stepAtual  status                Página                         Descrição
─────────────────────────────────────────────────────────────────────────────
0          iniciado              /onboarding                    Landing + chat IA
1          chat_iniciado         /onboarding                    Chat em andamento
2          simulador             /onboarding/simulador          Simulador financeiro
3          plano_escolhido       /onboarding/plano              Seleção de plano
4          dados_preenchidos     /onboarding/dados              Formulário pessoal/empresa
5          revisao               /onboarding/revisao            Vencimento + forma de pagamento
6          contrato_enviado      /onboarding/contrato           Aceite + envio para assinatura
6          assinado              /onboarding/confirmacao        Aguardando ativação
—          convertido            —                              Cliente criado (webhook ZapSign)
```

#### Fluxo detalhado

```
1. Prospect acessa widget público (avos.digital/onboarding)
2. Chat com IA (Claude Haiku 4.5)
   └── Prompt personalizado pelo escritório (iaPromptOnboarding no CRM)
   └── IA coleta: nome, email/telefone, tipo de empresa, necessidades
   └── Cria Lead via POST /api/leads com contatoEntrada validado (email ou telefone com DDD)
   └── Rate limit: 10 leads/IP/hora
3. Simulador: prospect escolhe regime tributário, faturamento estimado, funcionários
4. Recomendação de plano: POST /api/onboarding/recomendar-plano
   └── IA (Claude Haiku) analisa e sugere: essencial | profissional | empresarial | startup
   └── Timeout: 10s com AbortController; fallback estático se IA falhar
   └── Rate limit: 5 recomendações/IP/hora
5. Dados pessoais/empresa: /onboarding/dados
   └── Campos obrigatórios: nome completo (≥2 palavras), CPF (com dígito verificador), e-mail, telefone
   └── Campos condicionais: CNPJ (com dígito verificador) — planos profissional/empresarial/startup
   └── Auto-save a cada 1.5s via useAutoSave() → POST /api/onboarding/salvar-progresso
       └── Retry automático: 2 tentativas com backoff (2s, 4s) em caso de falha de rede
   └── Lookup automático: CEP (8s timeout) e CNPJ (preenchimento automático via useCnpj)
   └── Restaura dados ao recarregar: GET /api/onboarding/lead/:id (público, sem auth)
6. Revisão: escolha de vencimento (dias configurados no escritório) e forma de pagamento
7. Contrato: exibição do contrato com dados reais do lead + escritório
   └── Aceite de checkbox obrigatório para habilitar botão
   └── POST /api/leads/:id/contrato/enviar → cria contrato + envia para ZapSign/Clicksign
8. Confirmação: página aguardando assinatura
   └── Estado "aguardando": instrui verificar e-mail para assinar
   └── Estado "assinado" (legado): exibe link para download do PDF assinado
```

#### APIs do Onboarding

| Endpoint | Método | Auth | Rate Limit | Descrição |
|----------|--------|------|-----------|-----------|
| `/api/leads` | POST | Não | 10/IP/hora | Cria lead; valida email ou telefone (DDD) |
| `/api/onboarding/lead/:id` | GET | Não | 60/IP/hora | Lê dados do lead (wizard público) |
| `/api/onboarding/salvar-progresso` | POST | Não | 120/IP/hora | Salva etapa do wizard; merge de dadosJson |
| `/api/onboarding/recomendar-plano` | POST | Não | 5/IP/hora | IA recomenda plano; timeout 10s |
| `/api/onboarding/chat` | POST | Não | 30 msgs/sessão/hora | Chat IA de onboarding |
| `/api/onboarding/config` | GET | Não | — | Config pública do escritório para o widget |
| `/api/leads/:id/contrato/enviar` | POST | Não | — | Gera contrato + envia para assinatura eletrônica |
| `/api/webhooks/zapsign` | POST | Header X-ZapSign-Secret | — | Processa assinatura; converte Lead → Cliente |

**⚠️ Endpoint `/api/leads/:id` (GET/PUT) requer autenticação** — nunca usar direto no wizard público. Usar sempre `/api/onboarding/lead/:id` (GET) e `/api/onboarding/salvar-progresso` (POST).

#### Validações implementadas

**Frontend (dados/page.tsx)**:
- Nome: mínimo 2 palavras
- CPF: comprimento 11 dígitos + algoritmo de dígito verificador (detecta CPFs falsos como `111.111.111-11`)
- CNPJ: comprimento 14 dígitos + algoritmo de dígito verificador
- E-mail: regex básico de formato
- Telefone: mínimo 10 dígitos (com DDD)
- CEP: 8 dígitos → lookup automático com AbortController de 8s

**Backend (POST /api/leads)**:
- `contatoEntrada`: formato de e-mail válido OU telefone com DDD (≥10 dígitos numéricos)
- Campos opcionais com max() para evitar payloads abusivos

**Webhook ZapSign (conversão Lead→Cliente)**:
- Valida presença e formato de nome, CPF (11 dígitos), e-mail e telefone antes de tentar criar cliente
- Se dados faltam: marca contrato como assinado + dispara alerta Sentry operacional + retorna 200 (sem retry inútil)
- Lead com dados incompletos requer intervenção manual pelo contador

#### Segurança do Webhook ZapSign

```
Autenticação: header X-ZapSign-Secret (preferencial) ou ?secret= (query param, legado compatível)
Idempotência: check de status DENTRO da $transaction previne race conditions
Race P2002: recuperação via $transaction atômica (não duas queries separadas)
Dados pessoais: CPF/email/nome NÃO enviados como extra no Sentry (LGPD)
```

**Configuração no painel ZapSign**: URL `https://seudominio/api/webhooks/zapsign` com header `X-ZapSign-Secret: {valor_do_zapsignWebhookSecret}`. Query param `?secret=` ainda funciona por compatibilidade mas é desaconselhado (aparece em logs de acesso).

#### Conversão Lead → Cliente (webhook ZapSign)

```
1. ZapSign dispara POST após todos assinarem (event_type=doc_signed, status=signed)
2. Verifica secret de autenticação
3. Localiza Contrato pelo zapsignDocToken
4. Check de idempotência DENTRO da $transaction:
   └── Já processado + cliente existe → retorna 200 imediatamente
   └── Já processado + cliente NÃO existe → retenta conversão
5. Valida dados obrigatórios (nome, CPF, e-mail, telefone)
   └── Se faltam dados → marca assinado + alerta Sentry + retorna 200
6. $transaction atômica:
   └── Atualiza Contrato (status=assinado, assinadoEm, pdfUrl)
   └── Atualiza Lead (status=assinado, stepAtual=6)
   └── cria Cliente via criarClienteDeContrato()
   └── Vincula clienteId no Contrato
7. P2002 (unique constraint): recuperação atômica via $transaction
8. Efeitos colaterais (fora da transaction):
   └── indexarAsync('cliente') → RAG
   └── enviarBoasVindas() → e-mail de boas-vindas com magic link do portal
   └── provisionarClienteAsaas() → createCustomer + createSubscription
```

#### Auto-save (useAutoSave hook)

```typescript
// src/hooks/use-auto-save.ts
useAutoSave(leadId, payloadJson, delay=1500)
// ↓
// Debounce 1.5s após última alteração de formulário
// POST /api/onboarding/salvar-progresso com { leadId, ...payload }
// Retry: 2 tentativas com backoff (2s × (attempt+1))
// Estados: idle | saving | saved | error
// Indicador visual na tela: "Salvando..." / "Salvo automaticamente"
```

### 2. Fluxo de WhatsApp

```
1. Mensagem recebida na Evolution API
2. POST /api/whatsapp/webhook
3. Validação do payload
4. Rate limit: mínimo 5s entre respostas (RATE_LIMIT_MS)
5. Identificar contato:
   └── buscar por telefone → Cliente? Lead? Sócio? Prospect?
   └── Cache 24h (PHONE_CACHE_TTL_MS)
6. Buscar/criar ConversaIA
7. Lock distribuído via processandoEm (evita duplo processamento)
8. Processar mídia:
   └── Áudio → transcrever (Whisper)
   └── Imagem → enviar base64 para Claude (visão)
   └── PDF → extrair texto + resumir
9. Carregar contexto (sistema, cliente, histórico últimas 20 msgs)
10. ask() → resposta da IA
    └── Se ##HUMANO## → criar Escalação
11. sendHumanLike() → enviar resposta Evolution API
12. Salvar MensagemIA no banco
```

### 3. Fluxo de Emissão de NFS-e

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
   b. Indexa no RAG
   c. Notifica equipe CRM
   d. Se spedyEnviarAoAutorizar = true → entregarNotaCliente(canal)
      └── WhatsApp: texto + PDF + XML (retry 3x com backoff 2s)
      └── Email: assunto + PDF + XML em anexo
      └── Portal: Chamado visível no portal (visivelPortal: true) +
                  nota disponível em /portal/notas-fiscais (PDF e XML)
8. Portal: badge "NFS-e" no header conta notas autorizadas nos últimos 30 dias
```

### 4. Fluxo de Email (IMAP Sync)

```
1. Cron job /api/email/sync (autenticado com CRON_SECRET)
2. Conectar IMAP (imapflow) → buscar UNSEEN
3. Parser (mailparser): texto, HTML, attachments, inReplyTo, references
4. Threading: messageId + inReplyTo + threadId
5. Buscar cliente por email FROM
6. Criar Interacao (tipo: email_recebido, origem: sistema)
7. Notificar operador responsável
8. Agente pode responder via tool enviarEmail()
```

**Resiliência IMAP** (v3.10.10): `imap.ts` trata desconexão mid-fetch sem perder emails já coletados.
- `client.on('error', () => {})` evita `uncaughtException` quando servidor fecha socket
- Erro `NoConnection` durante iteração → emails parciais são válidos; reconecta apenas para marcar `\Seen`
- `getImapConfig()` retorna `null` (sem throw) se credenciais ausentes — sync pula silenciosamente
- `testarConexaoImap()` disponível para diagnóstico via UI

### 5. Fluxo de Chamado (Suporte)

```
ABERTURA:
1. Cliente abre chamado no portal (/portal/suporte/chamados/nova)
   └── Ou operador/IA cria via CRM / tool criarChamado()
2. Chamado criado com status: aberta, origem: cliente|crm|agente

ATENDIMENTO (CRM /crm/chamados/[id]):
3. Operador visualiza timeline: solicitação + resposta + notas internas
4. Pode atualizar status, responder e/ou adicionar nota interna em um submit:
   └── status → salva no Chamado
   └── resposta → visível ao cliente no portal
   └── nota_interna → cria ChamadoNota (só CRM, nunca enviado ao cliente)
   └── Label do botão muda dinamicamente: Salvar | Salvar nota | Enviar resposta | Resolver chamado

RESOLUÇÃO (status = resolvida):
5. PATCH multipart com canais de entrega opcionais:
   └── Portal: documento disponível automaticamente
   └── Email: SMTP com PDF como anexo
   └── WhatsApp: sendMedia para titular + sócios selecionados
6. Push notification para cliente no portal
7. Interação registrada no histórico (tipo: os_resolvida)

AVALIAÇÃO:
8. Cliente avalia chamado no portal (1-5 estrelas + comentário)
```

**Modelo `ChamadoNota`** (`chamado_notas`):
- `chamadoId`, `conteudo`, `autorId`, `criadoEm`
- Exibida na timeline com fundo âmbar e ícone de cadeado
- Nunca exposta no portal do cliente

### 6. Fluxo de Escalação

```
1. IA detecta caso complexo → ##HUMANO## no texto
2. Conversa pausada (pausadaEm = now)
3. Escalacao criada com historico (JSON) + motivoIA
4. Notificação para operadores no CRM
5. Operador vê no grid de Atendimentos (ping em tempo real via SSE)
6. Operador responde via /api/escalacoes/[id]/responder
7. Resposta enviada ao cliente (canal original: WA/portal)
8. IA retoma conversa se necessário
```

**Badge IA/Humano no portal** (v3.10.12): `portal-clara.tsx` atualiza o indicador de status a cada 8s via polling do GET `/api/portal/chat`. O campo `pausada` é lido nos dois sentidos — quando operador assume **e** quando devolve para IA.

### 6. Fluxo de Cobrança (Asaas)

```
1. Cliente provisionado: createCustomer() → salva asaasCustomerId
2. Subscription criada: createSubscription() (cycle=MONTHLY obrigatório) → salva asaasSubscriptionId
3. Asaas gera cobranças automaticamente
4. Webhook /api/webhooks/asaas (header: access_token):
   └── PAYMENT_CREATED   → upsert CobrancaAsaas + enriquece PIX/boleto em background
   └── PAYMENT_RECEIVED  → marca RECEIVED, reativa inadimplente se aplicável
   └── PAYMENT_CONFIRMED → idem RECEIVED (Asaas envia um ou outro por forma de pagamento)
   └── PAYMENT_OVERDUE   → status: inadimplente + notifica equipe
   └── PAYMENT_UPDATED   → atualiza data/valor + re-enriquece
   └── PAYMENT_DELETED   → cancela cobrança local
   └── PAYMENT_REFUNDED  → marca REFUNDED
5. Se inadimplente:
   └── Automático: notificar operador
   └── Manual: operador usa ferramenta de cobrança
   └── IA usa enviarCobrancaInadimplente()
6. Segunda via: gerarSegundaVia() → cria nova cobrança avulsa no Asaas + cancela original
```

**Comportamentos importantes da API Asaas (validados em sandbox 2026-04-03):**
- `cycle` é **obrigatório** na criação de subscription. O código usa sempre `MONTHLY`.
- `value` deve ser **> 0** — API retorna `invalid_value` para valor zero.
- Cancelar cobrança: usar **`DELETE /payments/{id}`** (retorna `{deleted:true}`). O endpoint `POST /payments/{id}/cancel` retorna 404 — corrigido no código.
- `GET /payments/{id}/pixQrCode` funciona mesmo para cobranças BOLETO (Asaas gera QR para tudo). O código verifica `forma === 'pix'` antes de chamar — correto.
- `GET /payments/{id}/identificationField` retorna HTTP 400 para cobranças PIX.
- CPF/CNPJ duplicado: sandbox permite; produção pode rejeitar. Idempotência garantida via `asaasCustomerId` persistido antes da subscription.
- `nextDueDate` na resposta de subscription = vencimento da **próxima** cobrança após a primeira gerada.
- Webhook header: Asaas envia no header **`access_token`**. O código aceita também `asaas-access-token` como fallback.
- `invoiceUrl` é **público** (sem auth) — link direto de pagamento. Pode ser enviado ao cliente via WhatsApp sem precisar do portal.
- `GET /payments?customer=...&status=PENDING` — filtro por status funciona.

**Notificações nativas do Asaas (automáticas por customer — email e SMS):**
| Evento | scheduleOffset | Destinatários |
|---|---|---|
| `PAYMENT_CREATED` | 0 | Cliente (email+SMS) |
| `PAYMENT_DUEDATE_WARNING` | 10 dias antes | Cliente (email+SMS) |
| `PAYMENT_DUEDATE_WARNING` | 0 (dia do vencimento) | Cliente (email+SMS) |
| `SEND_LINHA_DIGITAVEL` | 0 | Cliente (email+SMS) — boleto |
| `PAYMENT_OVERDUE` | 0 | Escritório + cliente (email+SMS) |
| `PAYMENT_OVERDUE` | 7 dias após | Cliente (email+SMS) |
| `PAYMENT_RECEIVED` | 0 | Escritório + cliente (email+SMS) |
| `PAYMENT_UPDATED` | 0 | Cliente (email+SMS) |

- `scheduleOffset` válidos para `DUEDATE_WARNING`: 5, 10, 15, 30 dias (3 dias não suportado)
- WhatsApp nativo do Asaas: desabilitado por padrão (`whatsappEnabledForCustomer: false`) — requer plano adicional
- `notificationDisabled: true` no customer desabilita todos os emails/SMS do Asaas

**Divisão de responsabilidades (decisão fechada):**
- **Asaas cuida:** todas as notificações automáticas ao cliente (email D-10, D-0, D+7, confirmação de pagamento)
- **AVOS cuida:** sincronizar status no CRM via webhook + notificação interna da equipe (bell) quando inadimplente
- **Operator/IA:** tools manuais `enviarCobrancaInadimplente` e `enviarLembreteVencimento` para WhatsApp on-demand
- **`buscarCobrancaAberta` (IA):** retorna cobrança PENDING/OVERDUE com PIX/boleto. Quando não há cobrança em aberto, retorna também o último pagamento recebido (RECEIVED) com valor e data — permite confirmar pagamentos via WhatsApp/portal ("confirmou meu pagamento?")
- **Cron D-3 automático:** ❌ não implementar — Asaas cobre
- **Multa/juros:** ❌ não configurar por enquanto

**Telas implementadas (auditado 2026-04-03):**
- `src/components/crm/cliente-financeiro-tab.tsx` — aba Financeiro no detalhe do cliente: resumo (4 cards), alterar vencimento/forma, QR code PIX, código de barras boleto, segunda via, histórico 24 cobranças, sync manual, provisionar
- `src/app/(crm)/crm/financeiro/inadimplentes/page.tsx` + `src/components/crm/inadimplentes-client.tsx` — lista de inadimplentes com cobrança individual e em lote (3 níveis: gentil/urgente/reforço) via WhatsApp
- `src/components/portal/portal-financeiro-client.tsx` — portal do cliente: cobrança em aberto com QR/boleto, alerta PIX expirado, segunda via, histórico 12 cobranças
- Badge "Inadimplente" na lista de clientes: ✅ já renderizado via `STATUS_CLIENTE_COLORS` (vermelho)
- Filtro por status=inadimplente na lista de clientes: ✅ search bar inclui todos os status automaticamente
- Config Asaas em `/crm/configuracoes/integracoes`: ✅ campos API key, ambiente (sandbox/producao), webhook token

**Único gap restante:**
- Widget de inadimplência no dashboard CRM (`/crm/dashboard`) — sem dados financeiros/Asaas atualmente

### 7. Fluxo de RAG (Indexação + Busca)

```
INGESTÃO:
1. Documento criado/atualizado no banco
2. Ingestor apropriado processa (texto, chunking)
3. Embedding gerado (Voyage AI ou Anthropic)
4. Vetores salvos em PostgreSQL + pgvector
5. Índice HNSW para busca aproximada

BUSCA (Híbrida):
1. Query do usuário/IA
2. Embedding da query
3. Similarity search (cosine distance, threshold 0.72)
4. Full-text search (PostgreSQL tsvector)
5. Reranking e merge dos resultados
6. Top-K injetados no contexto da IA
```

---

## 🔌 APIs / Interfaces

### Autenticação

| Rota | Método | Auth | Descrição |
|------|--------|------|-----------|
| `/api/auth/[...nextauth]` | GET/POST | — | NextAuth CRM (credentials) |
| `/api/portal/magic-link` | POST | — | Enviar magic link por email |
| `/api/portal/otp/whatsapp` | POST | — | Enviar OTP via WhatsApp |
| `/api/portal/otp/verificar` | POST | — | Validar OTP |
| `/api/portal/logout` | POST | Portal session | Revogar sessão |

### CRM — Clientes

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/clientes` | GET | Listar (paginado, filtros: status, plano, busca) |
| `/api/clientes` | POST | Criar cliente |
| `/api/clientes/[id]` | GET/PUT | Detalhe / atualizar |
| `/api/clientes/[id]/suspender` | POST | Suspender |
| `/api/clientes/[id]/cancelar` | POST | Cancelar |
| `/api/clientes/[id]/reativar` | POST | Reativar |
| `/api/crm/clientes/[id]/cobrancas` | GET | Cobranças Asaas |
| `/api/crm/clientes/[id]/cobrancas/[id]/segunda-via` | GET | Segunda via |
| `/api/crm/clientes/[id]/forma-pagamento` | PUT | Atualizar forma de pagamento |
| `/api/crm/clientes/[id]/vencimento` | PUT | Atualizar dia vencimento |
| `/api/crm/clientes/[id]/portal-chat` | GET/POST | Clara para o cliente |
| `/api/crm/clientes/[id]/provisionar` | POST | Criar no Asaas |

### CRM — Empresas e Sócios

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/crm/empresas/[id]` | PATCH | Atualizar dados da empresa (razão social, CNPJ, regime, nome fantasia) |
| `/api/crm/empresas/[id]/socios` | POST | Adicionar sócio à empresa |
| `/api/crm/socios/[id]` | PATCH | Editar dados do sócio (nome, CPF, email, telefone, whatsapp, qualificação, participação, principal) |
| `/api/crm/socios/[id]` | DELETE | Remover sócio (revoga portal access automaticamente) |
| `/api/crm/socios/[id]/portal-access` | PATCH | Habilitar/desabilitar acesso ao portal |
| `/api/crm/socios/[id]/enviar-convite` | POST | Enviar convite de acesso ao portal |

**Decisão de arquitetura (2026-04-04):** `Empresa.status` foi removido do schema (migration `20260404010142_remove_empresa_status`). O status exibido em `/crm/empresas` agora vem de `empresa.cliente.status` — única fonte de verdade. Os valores válidos do enum `StatusCliente` são: `ativo | inadimplente | suspenso | cancelado`.

**Página `/crm/empresas/[id]` — abas disponíveis:**
- Visão Geral: dados da empresa + composição societária
- Titular: dados completos do cliente com `EditarClienteButton`
- Sócios: CRUD completo (adicionar, editar, remover) + portal controls
- Chamados: lista filtrada por empresa com botão "Novo Chamado"
- Documentos, Portal, Conversas IA, Financeiro (placeholder), Fiscal

### CRM — NFS-e

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

### CRM — Chamados

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/crm/chamados` | GET/POST | Listar / criar chamado |
| `/api/crm/chamados/[id]` | GET | Detalhe do chamado |
| `/api/crm/chamados/[id]` | PATCH (JSON) | Atualizar status, resposta, nota interna |
| `/api/crm/chamados/[id]` | PATCH (multipart) | Resolver com arquivo + canais de entrega |

**PATCH JSON aceita:**
- `status` — novo status (`em_andamento`, `aguardando_cliente`, `resolvida`, `cancelada`)
- `resposta` — texto visível ao cliente no portal
- `nota_interna` — cria um `ChamadoNota` (só visível no CRM, nunca enviado ao cliente)
- `prioridade` — `baixa`, `media`, `alta`

**PATCH multipart** (resolução completa):
- `resposta`, `categoria`, `arquivo` (File) ou `documento_id/url/nome/mime` (doc existente)
- `canal_email=1`, `email_assunto`, `email_corpo`
- `canal_whatsapp=1`, `wpp_mensagem`, `wpp_destinatarios` (JSON array de sócios)

### CRM — Email

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/email/inbox` | GET | Listar inbox IMAP (paginado) |
| `/api/email/inbox/[id]/vincular` | POST | Vincular email a cliente/lead |
| `/api/email/inbox/[id]/arquivar-anexo` | POST | Arquivar anexo no R2 |
| `/api/email/enviar` | POST | Enviar email SMTP |
| `/api/email/sync` | POST | Sincronizar IMAP (cron, precisa CRON_SECRET) |

### CRM — IA e Agente

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/crm/ai/chat` | POST | Chat IA com cliente (stream SSE) |
| `/api/agente/crm` | POST | Executar agente operacional |
| `/api/agente/tools` | GET | Listar tools disponíveis |
| `/api/agente/acoes` | GET | Histórico de ações executadas |
| `/api/agente/agendamentos` | GET/POST | Crons do agente |

### CRM — UI em Tempo Real

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/badges` | GET | Contadores sidebar: escalações pendentes, emails, chamados abertos |

### Webhooks Recebidos

| Rota | Validação | Descrição |
|------|-----------|-----------|
| `/api/webhooks/asaas` | `asaasWebhookToken` no header | Pagamentos/cobranças |
| `/api/webhooks/spedy/[token]` | token = SHA-256 da API key | Status NFS-e |
| `/api/webhooks/zapsign` | HMAC do payload | Assinatura de contrato |
| `/api/webhooks/clicksign` | Token do escritório | Assinatura de contrato |
| `/api/whatsapp/webhook` | — | Mensagens WhatsApp (Evolution API) |

### Portal do Cliente

| Rota | Auth | Descrição |
|------|------|-----------|
| `/api/portal/financeiro/cobrancas` | Portal session | Listar cobranças |
| `/api/portal/financeiro/segunda-via` | Portal session | Segunda via |
| `/api/portal/documentos` | Portal session | Listar/upload documentos |
| `/api/portal/documentos/[id]/download` | Portal session | Download com URL assinada R2 |
| `/api/portal/notas-fiscais` | Portal session | Listar NFS-e |
| `/api/portal/notas-fiscais/[id]/pdf` | Portal session | Download PDF (R2-first → Spedy fallback) |
| `/api/portal/notas-fiscais/[id]/xml` | Portal session | Download XML (R2-first → Spedy fallback) |
| `/api/portal/chamados` | Portal session | Listar/criar chamados |
| `/api/portal/chat` | Portal session | Clara (IA) |
| `/api/portal/push/subscribe` | Portal session | Registrar web push |

### Cron Jobs (precisam `CRON_SECRET` no header)

| Rota | Frequência | Descrição | Monitor |
|------|-----------|-----------|---------|
| `/api/email/sync` | A cada 5 min (`*/5 * * * *`) | Sincronizar IMAP | `HC_EMAIL_SYNC` |
| `/api/whatsapp/processar-pendentes` | 5× por minuto | Processar fila WA (debounce) | `HC_PROCESSAR_PENDENTES` |
| `/api/agente/cron` | A cada minuto (`* * * * *`) | Disparar agendamentos do agente | `HC_AGENTE` |
| `/api/cron/reconciliar-notas` | A cada hora (`0 * * * *`) | Fallback de reconciliação de NFS-e | `HC_RECONCILIAR_NOTAS` |
| `/api/cron/retry-documentos` | A cada hora (`0 * * * *`) | Retry de resumo IA em documentos que falharam | `HC_RETRY_DOCUMENTOS` |

Todos os crons fazem ping no **healthchecks.io** (start/ok/fail) via `src/lib/healthchecks.ts`. UUIDs configurados via vars `HC_*` no `.env`. Conta: alissonsaraiva@gmail.com.

---

## 🔗 Integrações Externas

### Asaas (Cobrança)
- **Tipo**: REST API externa
- **Auth**: `asaasApiKey` salvo por escritório no banco (`asaasAmbiente`: `sandbox` | `producao`)
- **Webhook**: `asaasWebhookToken` no header `access_token` → `/api/webhooks/asaas`
- **Formas suportadas**: apenas PIX e boleto (cartão fora do escopo)
- **Ponto de falha**: Asaas offline → cobranças não atualizadas. Sem retry automático.
- **Arquivo principal**: `src/lib/asaas.ts`, `src/lib/services/asaas-sync.ts`
- **Cancelar cobrança**: `DELETE /payments/{id}` (não usar `POST /payments/{id}/cancel` — retorna 404)
- **Cron D-3**: pendente de implementação em `/api/cron/lembrete-cobranca`
- **Provisionar manualmente**: `POST /api/crm/clientes/[id]/provisionar` — idempotente, reutiliza IDs existentes

### Spedy (NFS-e)
- **Tipo**: REST API por empresa (cada empresa tem sua própria `spedyApiKey`)
- **Autenticação**: header `X-Api-Key` (não `Authorization`)
- **Webhook**: token = SHA-256 da API key → `/api/webhooks/spedy/[token]`
- **Ponto de falha**: Webhook pode chegar fora de ordem; cron de reconciliação atua como fallback
- **Reconciliação**: cron `0 * * * *` → `/api/cron/reconciliar-notas` — dois batches:
  - **Batch 1**: notas em `enviando` sem `spedyId` há >10 min → marca `erro_interno` + abre chamado
  - **Batch 2**: notas em `enviando`/`processando` com `spedyId` há >10 min → consulta status atual na Spedy via `consultarNfse`, constrói payload sintético e repassa para `processarWebhookSpedy`; ID deterministico (`reconciliacao-{notaId}-{spedyId}`) garante idempotência contra duplo processamento
- **Monitoramento**: healthchecks.io (`HC_RECONCILIAR_NOTAS`) — alerta se o cron parar de rodar
- **Limite de paginação**: `pageSize` máximo = **100** por página (API rejeita valores maiores)
- **Municípios CE (sandbox)**: 15 cidades — Aquiraz, Eusébio, Fortaleza, Horizonte, Ipu, Jaguaruana, Juazeiro do Norte, Missão Velha, Pacajus, Russas, Sobral, Tianguá, Ubajara, Viçosa do Ceará, Várzea Alegre
- **Arquivo principal**: `src/lib/services/notas-fiscais.ts`, `src/lib/services/nfse/`
- **Cobertura de município**: `GET /api/crm/clientes/[id]/spedy` retorna `municipioIntegrado: boolean | null`. Estratégia: se cliente tem CEP → ViaCEP → código IBGE → `verificarMunicipio(ibge)` (match exato); fallback: scan paginado por nome normalizado com cache 24h por UF. Apenas informativo — não bloqueia emissão.
- **`useCep` hook**: `src/hooks/use-cep.ts` — auto-fill de endereço via ViaCEP ao digitar 8 dígitos do CEP. Retorna `{ logradouro, bairro, cidade, uf, cep, ibge }`. Usado em: `novo-cliente-drawer.tsx`, `editar-cliente-drawer.tsx`, `portal-contato-edit.tsx`.
- **Webhook Spedy** (obrigatório para produção): `GET /api/crm/configuracoes/spedy/webhook` — checa se está registrado/ativo na Spedy; `POST` — registra ou reativa. Sem webhook, autorizações chegam apenas via cron (latência de até 1h). Registrar uma única vez por conta Owner.
- **Reenvio de e-mail ao tomador**: `POST /api/crm/notas-fiscais/[id]/reenviar-email` — chama `POST /service-invoices/{id}/resend-email` na Spedy. Requer nota `autorizada` + `tomadorEmail` preenchido. Tool IA: `reenviarEmailNotaFiscal`.
- **Notas presas sem spedyId**: cron de reconciliação detecta notas `enviando` com `spedyId = null` após 10 min → marca `erro_interno` + abre Chamado de escalação automática.
- **Entrega ao cliente (canal portal)**: cria `Chamado` com `visivelPortal: true` notificando que a NFS-e está disponível. O cliente baixa PDF e XML diretamente em `/portal/notas-fiscais`. Badge "NFS-e" aparece no header do portal para notas dos últimos 30 dias.
- **Download PDF/XML no portal**: endpoints `GET /api/portal/notas-fiscais/[id]/pdf` e `/xml` usam estratégia R2-first → fallback Spedy. Garante download mesmo se a Spedy estiver offline, desde que o backup R2 tenha sido salvo na autorização.
- **Backup PDF/XML no R2**: `salvarPdfXmlNoR2()` em `src/lib/services/nfse/backup.ts` — chamado imediatamente ao autorizar. URLs salvas em `notaFiscal.pdfUrl` e `xmlUrl` como chaves R2 (não URLs diretas da Spedy).

#### Comportamento dos endpoints — validado em 2026-04-03 (sandbox)

| Endpoint | Método | Body | Observação |
|---|---|---|---|
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

#### Campos da resposta de NFS-e — divergências com a interface TypeScript

| Campo API | Interface TS | Observação |
|---|---|---|
| `number: 0` | `number \| null` | API retorna `0` (não `null`) quando nota ainda não tem número — usar `\|\| null` ao salvar |
| `rps.number: 0` | `number` | Idem — `0` = ainda não protocolado |
| `rps.series: null` | `string` | Pode ser `null` |
| `processingDetail.on` | não mapeado | Campo extra na resposta, ignorado sem impacto |
| `authorization.date/protocol: null` | `string` | Null quando não autorizado ainda |

### Evolution API (WhatsApp)
- **Tipo**: REST API self-hosted (provavelmente na VPS ou terceiro)
- **Auth**: Bearer token (`EVOLUTION_API_KEY`)
- **Webhook**: `/api/whatsapp/webhook` (sem autenticação de payload)
- **Ponto de falha**: Instância desconectada → mensagens não chegam. Sem health check automático.

### Cloudflare R2 (Storage)
- **Tipo**: S3-compatible
- **Auth**: `STORAGE_ACCESS_KEY_ID` + `STORAGE_SECRET_ACCESS_KEY`
- **URLs**: bucket privado — sempre usar URL assinada (`getDownloadUrl(key, segundos)`) para envio externo
- **⚠️ URLs públicas brutas retornam 403** — Evolution API e qualquer serviço externo precisa de URL assinada
- **Fluxo humano→WhatsApp** (`/api/conversas/[id]/mensagem`): detecta URL R2 pelo prefixo `STORAGE_PUBLIC_URL` e converte para signed URL (5 min) antes de chamar `sendMedia`
- **Ponto de falha**: signed URLs expiram — não armazenar nem reusar; sempre gerar na hora do envio

### Zapsign / Clicksign (Assinatura Eletrônica)
- **Tipo**: REST API (selecionável por escritório)
- **Webhook**: `/api/webhooks/zapsign` e `/api/webhooks/clicksign`
- **Idempotência**: `WebhookLog` previne processamento duplicado

### DocuSeal (Self-hosted)
- **URL**: `http://82.25.79.193:32825`
- **Tipo**: Iframe embed (não REST puro)
- **Ponto de falha**: Single point of failure — está na VPS

### SERPRO (CNPJ/CPF)
- **Auth**: tokens salvos no banco (`Escritorio.serproCpfToken`, `serproCnpjToken`)
- **Ponto de falha**: Rate limit e autenticação vencida causam falha silenciosa no auto-fill

### Anthropic API (IA Principal)
- **Modelos**: Claude Haiku 4.5 (padrão), Claude Sonnet/Opus (configurável)
- **Ponto de falha**: Sem fallback automático para outro provider se API cair

---

## ⚙️ Configuração

### Variáveis de Ambiente

```env
# ─── Banco de Dados ──────────────────────────────────────
DATABASE_URL="postgresql://user:pass@host:5432/contabil_ia"
VECTORS_DATABASE_URL="..."        # mesmo banco se tiver pgvector

# ─── Auth ────────────────────────────────────────────────
AUTH_SECRET="openssl rand -base64 32"
AUTH_URL="https://crm.avos.digital"

# ─── IA ──────────────────────────────────────────────────
ANTHROPIC_API_KEY=""
OPENAI_API_KEY=""          # opcional
OPENAI_BASE_URL=""         # opcional
GOOGLE_API_KEY=""          # opcional
GROQ_API_KEY=""            # opcional
VOYAGE_API_KEY=""          # para embeddings (alternativa ao Anthropic)

# ─── Storage (Cloudflare R2) ─────────────────────────────
STORAGE_ENDPOINT="https://<account>.r2.cloudflarestorage.com"
STORAGE_ACCESS_KEY_ID=""
STORAGE_SECRET_ACCESS_KEY=""
STORAGE_BUCKET_NAME="contabai"
STORAGE_PUBLIC_URL="https://storage.avos.digital"
STORAGE_REGION="auto"

# ─── WhatsApp (Evolution API) ────────────────────────────
EVOLUTION_API_URL=""
EVOLUTION_INSTANCE=""
EVOLUTION_API_KEY=""

# ─── Monitoramento ───────────────────────────────────────
NEXT_PUBLIC_SENTRY_DSN=""
SENTRY_ORG=""
SENTRY_PROJECT=""
SENTRY_AUTH_TOKEN=""

# ─── Web Push (PWA) ──────────────────────────────────────
NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
VAPID_SUBJECT="mailto:contato@avos.digital"

# ─── Cron Jobs ───────────────────────────────────────────
CRON_SECRET="openssl rand -base64 32"

# ─── Healthchecks.io (monitoramento de crons) ────────────
# UUIDs em https://healthchecks.io — conta alissonsaraiva@gmail.com
HC_EMAIL_SYNC=""
HC_RECONCILIAR_NOTAS=""
HC_RETRY_DOCUMENTOS=""
HC_AGENTE=""
HC_PROCESSAR_PENDENTES=""

# ─── URLs Públicas ───────────────────────────────────────
NEXT_PUBLIC_APP_URL="https://avos.digital"
NEXT_PUBLIC_CRM_URL="https://crm.avos.digital"
NEXT_PUBLIC_PORTAL_URL="https://portal.avos.digital"
```

> **Nota**: `EMAIL_*`, `ASAAS_*`, `SPEDY_*`, `CLICKSIGN_*`, `SERPRO_*` são configurados **por escritório** e salvos criptografados no banco (`Escritorio`), não em variáveis de ambiente globais.

### Setup Local

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env.local

# 3. Gerar cliente Prisma
npx prisma generate

# 4. Aplicar migrations no banco local
npx prisma migrate dev

# 5. Seed de dados iniciais (planos)
npx prisma db seed

# 6. Inicializar pgvector
psql $DATABASE_URL -f prisma/init-vectors.sql

# 7. Rodar em desenvolvimento
npm run dev
```

### Pre-deploy checklist (OBRIGATÓRIO)

```bash
# 1. TypeScript sem erros
npx tsc --noEmit

# 2. Build de produção sem erros
npm run build

# 3. Criar tag de versão
git tag v3.x.y
git push origin v3.x.y  # CI só dispara com tag v*
```

---

## 🧠 Sistema de IA

### 4 Canais de IA

| Canal | Arquivo | Contexto | Tools | Escalação |
|-------|---------|---------|-------|-----------|
| **Onboarding** | `ask.ts` | Lead + planos | Limitadas (criar lead) | Não |
| **CRM** | `ask.ts` + `agent.ts` | Cliente + global | 60 tools | Sim |
| **Portal (Clara)** | `ask.ts` | Cliente + comunicados | Leitura + docs (links de download) | `##HUMANO##` → Escalação |
| **WhatsApp** | `ask.ts` | Cliente/lead + histórico 20 msgs | Moderadas | `##HUMANO##` → Escalação |

### Agente Operacional — 60 Tools

**Leitura de Dados (17)**:
`buscarDadosCliente`, `buscarDadosOperador`, `consultarDados`, `buscarHistorico`, `buscarDocumentos`, `buscarChamado`, `buscarEmailInbox`, `buscarTomadoresRecorrentes`, `buscarCobrancaAberta`, `listarLeadsInativos`, `listarComunicados`, `listarPlanos`, `listarAgendamentos`, `listarDocumentosPendentes`, `listarEmailsPendentes`, `listarChamados`, `verificarStatusContrato`

**Escrita/Mutação (24)**:
`criarLead`, `criarCliente`, `atualizarDadosCliente`, `atualizarStatusLead`, `avancarLead`, `criarChamado`, `responderChamado`, `registrarInteracao`, `enviarEmail`, `enviarWhatsAppCliente`, `enviarWhatsAppLead`, `enviarWhatsAppSocio`, `enviarDocumentoWhatsApp`, `enviarMensagemPortal`, `enviarComunicadoSegmentado`, `enviarCobrancaInadimplente`, `enviarLembreteVencimento`, `enviarNotaFiscalCliente`, `reativarCliente`, `transferirCliente`, `gerarContrato`, `enviarContrato`, `aprovarDocumento`, `publicarComunicado`

**NFS-e (8)**:
`emitirNotaFiscal`, `consultarNotasFiscais`, `reemitirNotaFiscal`, `cancelarNotaFiscal`, `verificarConfiguracaoNfse`, `enviarNotaFiscalCliente`, `reenviarEmailNotaFiscal`, `buscarTomadoresRecorrentes`

**Cobrança (3)**:
`gerarSegundaViaAsaas`, `buscarCobrancaAberta`, `gerarRelatorioInadimplencia`

**Agendamentos (3)**:
`criarAgendamento`, `listarAgendamentos`, `cancelarAgendamento`

**Escalação (2)**:
`responderEscalacao`, `convidarSocioPortal`

**IA/Análise (3)**:
`resumirDocumento`, `classificarEmail`, `resumirFunil`

**Documentos (1)**:
`anexarDocumentoChat` _(retorna link de download para WhatsApp/portal — não envia via WA)_

**Misc (3)**:
`publicarRelatorio`, `resumoDashboard`, `buscarCnpjExterno`

### RAG — Ingestores

| Ingestor | Fontes |
|---------|--------|
| `cliente` | Perfil completo (plano, contatos, endereço) |
| `lead` | Dados onboarding, histórico, status |
| `documento` | Conteúdo de PDFs, NFS-e, guias tributários |
| `escalacao` | Histórico + motivo da escalação |
| `interacao` | Emails, mensagens, anotações |
| `comunicado` | Publicações e alertas |
| `escritorio` | Dados do escritório (endereço, termos, contatos) |
| `agente` | Log de ações executadas (AgenteAcao) |
| `conversa` | Histórico de ConversaIA (WhatsApp, portal, onboarding) |

### Configurações da IA (por escritório)

Salvas no modelo `Escritorio`:
- `iaProvider`: `anthropic | openai | google | groq`
- `iaModel`: string do modelo
- `iaPromptCrm`: prompt customizado para o CRM
- `iaPromptPortal`: prompt customizado para o portal
- `iaPromptWhatsapp`: prompt customizado para WhatsApp
- `iaPromptOnboarding`: prompt customizado para onboarding
- `iaTemperatura`: 0.0 a 1.0
- `iaMaxTokens`: limite de tokens por resposta

---

## 📊 Schema do Banco — Modelos Principais

### Hierarquia de Entidades

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

### Enums Críticos

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

---

## 🧪 Testes

### O que está coberto
- ❌ Nenhum teste automatizado identificado no codebase (sem `*.test.ts`, `*.spec.ts`, `jest.config`, `vitest.config`)

### O que NÃO está coberto (lacunas críticas)
- Webhooks externos (Asaas, Spedy, Zapsign, Clicksign)
- Pipeline de WhatsApp (recebimento → processamento → resposta)
- Sistema de email (IMAP sync, threading, envio)
- Agente operacional (tool calling, idempotência)
- Fluxo de onboarding (etapas, validações)
- Sistema de pagamento (provisioning Asaas)
- Emissão de NFS-e (Spedy)

> **Risco alto**: O sistema está em produção sem cobertura de testes automatizados.

---

## ⚠️ Limitações Conhecidas

### Identificadas no código

1. **`src/middleware.ts` descontinuado** — coexiste com `src/proxy.ts`, causa build error se ativado
2. **Sem retry automático** para Spedy webhooks — se o servidor cair durante emissão, NFS-e fica em `enviando`; mitigado pelo cron de reconciliação (1h) e detecção de notas sem `spedyId`
3. **Lock de WhatsApp** (`processandoEm`) não tem timeout — se a instância cair mid-processing, conversa fica bloqueada indefinidamente
4. **Sem health check** para Evolution API — instância desconectada não é detectada proativamente
5. **DocuSeal self-hosted** (`82.25.79.193:32825`) — single point of failure na VPS
6. **URLs de mídia Evolution API** — dependem de campo `media` que pode variar por versão da API (comentário no código v3.10.7)
7. **Sem paginação** em alguns endpoints de listagem — risco de timeout com volumes grandes
8. **Embeddings sem fallback** — se Voyage AI cair e não há Anthropic como fallback configurado, RAG para
9. **Sem rate limiting** no endpoint `/api/agente/crm` — agente pode ser chamado em loop
10. **`atudalizarDadosCliente`** — nome com typo no código (deveria ser `atualizar`)

### Bugs corrigidos em v3.10.x

| Versão | Bug | Correção |
|--------|-----|----------|
| v3.10.9 | Envio de arquivo pelo humano no chat WhatsApp falha (circuit breaker) | `conversas/[id]/mensagem`: gera URL assinada R2 antes de chamar `sendMedia` |
| v3.10.9 | Mensagens duplicadas no escalonamento WhatsApp | `enviar-resposta.ts`: removida duplicação do histórico de mensagens |
| v3.10.9 | Links de documentos no chat do portal malformados (`https://api/...`) | `buscar-documentos.ts`: usa `NEXT_PUBLIC_PORTAL_URL` para construir URL completa |
| v3.10.9 | Documentos excluídos aparecendo no picker e nos resultados | `buscar-documentos.ts`, `crm/documentos`, `crm/clientes/[id]/documentos`: adiciona `deletadoEm: null` |
| v3.10.12 | IA do portal não conseguia enviar documentos ao cliente | `classificarIntencao` agora recebe `canal`; portal usa `buscarDocumentos` em vez de `enviarDocumentoWhatsApp` |
| v3.10.12 | Badge IA/Humano no portal não revertia ao devolver para IA | Polling 8s do `portal-clara` agora lê `pausada` nos dois sentidos |
| v3.10.12 | Canal "portal" sem label nos atendimentos e responder | `[id]/page.tsx` e `escalacao-responder.tsx` corrigidos |
| v3.10.12 | Badges sidebar/header estáticos após carregamento | `useBadges` hook com polling 30s via `/api/badges` |
| v3.10.12 | Emails CRM limitados a 500 registros mais antigos | Substituído por janela de tempo (90/180/365 dias) |
| v3.10.13 | `emissao_documento` exibido cru na tela de chamado | Adicionado ao mapa `TIPO_CHAMADO` em `/crm/chamados/[id]/page.tsx` |
| v3.10.13 | Refatoração: `OrdemServico` → `Chamado` | Modelo, rotas, componentes e service renomeados; tabela mantém `ordens_servico` via `@@map` |
| v3.10.13 | Notas internas de chamado | Novo modelo `ChamadoNota` + migration; API aceita `nota_interna`; timeline no CRM com visual âmbar |
| v3.10.13 | Label do botão sempre "Enviar resposta" mesmo sem resposta | Label dinâmico: Salvar / Salvar nota / Enviar resposta / Resolver chamado |
| v3.10.14 | PDF/XML do portal buscavam sempre da Spedy (502 se offline) | Proxies agora usam `buscarPdfXml()` com R2-first → Spedy fallback |
| v3.10.14 | Canal `portal` não notificava o cliente ao autorizar NFS-e | `entregarNotaCliente('portal')` cria Chamado visível no portal |
| v3.10.14 | Sem indicador visual de notas novas no portal | Badge `notasNovas` (30 dias) no item "Notas Fiscais" do header |
| v3.10.15 | `GET /api/leads/:id` exigia autenticação — wizard público não carregava dados ao recarregar | Novo endpoint público `GET /api/onboarding/lead/:id` com rate limit 60/IP/hora |
| v3.10.15 | Auto-save chamava `PUT /api/leads/:id` (exige auth) — todos os saves falhavam com 401 silenciosamente | `useAutoSave` agora usa `POST /api/onboarding/salvar-progresso` com retry 2x backoff |
| v3.10.15 | `salvar-progresso` sem try/catch — falha de DB gerava 500 silencioso, usuário perdia progresso | Adicionado try/catch completo + Sentry + rate limit 120/IP/hora |
| v3.10.15 | `POST /api/leads` aceitava qualquer string com 3+ chars em `contatoEntrada` | Validação Zod: e-mail regex OU telefone com DDD (≥10 dígitos numéricos) |
| v3.10.15 | Webhook ZapSign: CPF/email ausente só verificava CPF; cliente não criado sem alerta operacional | Validação completa (nome+CPF+email+telefone); alerta Sentry operacional quando faltam dados |
| v3.10.15 | Webhook ZapSign: race condition P2002 — recuperação fora da transaction era insegura | Recuperação P2002 agora usa `$transaction` atômica |
| v3.10.15 | Webhook ZapSign: secret enviado em query param (exposto em logs de acesso) | Aceita `X-ZapSign-Secret` header (preferencial); query param mantido por compatibilidade |
| v3.10.15 | Dados pessoais (nome, e-mail) enviados no `extra` do Sentry | Removido; apenas `leadId` e `camposFaltando` são enviados (LGPD) |
| v3.10.15 | CEP/CNPJ lookup sem timeout — campo congelava se API demorava | `AbortController` com timeout de 8s em `buscarCEP` |
| v3.10.15 | Validação de CPF/CNPJ só verificava comprimento — CPFs falsos passavam | Algoritmo de dígito verificador implementado em `validarCPF()` e `validarCNPJ()` |
| v3.10.15 | `recomendar-plano` engolia erros silenciosamente sem Sentry | try/catch com `Sentry.captureException` + AbortController de 10s na API Anthropic |

---

## 🚨 Pontos de Atenção

### Fluxos Frágeis

| Fluxo | Risco | Motivo |
|-------|-------|--------|
| WhatsApp webhook | Alto | Sem validação de autenticidade do payload |
| Processamento de NFS-e | Médio | Webhook assíncrono sem retry; cron de reconciliação (1h) é o fallback — monitorado via healthchecks.io |
| Sincronização de email | Baixo | Cron manual na VPS — monitorado via healthchecks.io (alerta se parar) |
| Conversão Lead→Cliente | Médio | 3 pontos de conversão distintos (leads/assinado, contrato/webhook, manual) — podem criar duplicatas; idempotência reforçada no webhook ZapSign (v3.10.15) |
| Magic links do portal | Médio | Token hash SHA-256, mas sem rate limit no `/api/portal/magic-link` |
| Lead assinado sem dados completos | Baixo | Webhook marca como assinado mas não cria cliente; requer intervenção manual; alerta Sentry configurado (v3.10.15) |

### Áreas com Pouco Log/Rastreamento

- Pipeline de WhatsApp: processamento de mídia falha silenciosamente em alguns casos
- Ingestão RAG: falhas de embedding podem não ser propagadas
- Envio de comunicados: `ComunicadoEnvio` rastreia, mas sem retry

### Código Complexo

- `src/lib/ai/agent.ts` — loop de tool calling com permissões por canal
- `src/lib/whatsapp/pipeline/` — múltiplas etapas assíncronas
- `src/lib/email/com-historico.ts` — threading de emails é não trivial
- `src/proxy.ts` — roteamento por subdomínio em Next.js 16 é frágil por design

---

## 🔍 Inconsistências Encontradas

1. **Nome do projeto**: `package.json` ainda tem versão `0.1.0` e nome interno inconsistente com AVOS
2. **`src/middleware.ts`**: arquivo existe mas está descontinuado — deveria ser removido para evitar confusão
3. **Tool `atudalizarDadosCliente`**: typo persistente no nome da tool (deveria ser `atualizarDadosCliente`)
4. **Documentação `docs/ia-arquitetura.md`**: provavelmente desatualizada em relação às 38 tools e 4 canais atuais
5. **Variáveis `ZAPI_*` no .env.example**: código atual usa `EVOLUTION_*` (Z-API era a integração anterior)
6. **`VAPIR_PRIVATE_KEY`** no .env.example: typo (deveria ser `VAPID_PRIVATE_KEY`)
7. **Endpoint `/api/escalacoes/pendentes-count`**: marcado como legacy no explore mas ainda existe
8. **Schema `Escalacao`**: campo `canal` usa `CanalEscalacao` mas `conversaIAId` é opcional — não força consistência

---

## 🧩 Lacunas (Features Implementadas Sem Documentação)

1. **`src/lib/whatsapp/pipeline/`** — novo pipeline modular, não documentado
2. **`src/lib/schemas/`** — schemas Zod centralizados, sem docs
3. **`src/lib/services/nfse/`** — módulo completo de NFS-e extraído, sem docs
4. **`src/components/crm/notas-fiscais/`** — componentes novos de NFS-e
5. **`src/app/(crm)/crm/chamados/`** — listagem e detalhe de chamados (refatorado de ordens-servico)
5. **`src/lib/whatsapp/arquivar-midia.ts`** — arquivamento de mídia recebida no R2
6. **`src/lib/whatsapp/identificar-contato.ts`** — identificação de contato com cache
7. **`src/lib/whatsapp/constants.ts`** — constantes centralizadas
8. **`src/components/ui/back-button.tsx`** — novo componente de navegação
9. **`src/app/api/email/inbox/[id]/arquivar-anexo/`** — endpoint para arquivar anexos de email
10. **Migration `20260402213941_add_email_thread_fields`** — novos campos de threading no email

---

## 💡 Sugestões de Melhoria

### Segurança
1. **Adicionar HMAC/auth no webhook WhatsApp** — qualquer um pode POSTar para `/api/whatsapp/webhook`
2. **Rate limit no magic link** — `api/portal/magic-link` sem proteção contra enumeração
3. ~~**Rate limit no agente**~~ — ✅ implementado: 60 req/userId/hora em `/api/agente/crm`
4. ~~**Migrar ZapSign para header**~~ — ✅ implementado: `X-ZapSign-Secret` é o único mecanismo; query param removido

### Confiabilidade
1. ~~**Timeout no lock de WhatsApp**~~ — ✅ já implementado: `LOCK_TIMEOUT = 30s` em `processar-pendentes.ts`
2. ~~**Retry para webhooks Spedy**~~ — ✅ cron de reconciliação (`/api/cron/reconciliar-notas`) cobre ambos os casos (sem/com `spedyId`)
3. **Health check Evolution API** — detectar instância desconectada proativamente

### Onboarding — Melhorias Implementadas (v3.10.16)
1. ~~**Verificação de e-mail por OTP**~~ — ✅ nova etapa `/onboarding/verificar-email` com OTP de 6 dígitos (10 min), rate limit duplo (IP + leadId), auto-verificação ao completar
2. ~~**Notificação de conversão por WhatsApp**~~ — ✅ `enviarBoasVindasWhatsApp()` disparado após conversão ZapSign; gera token de portal de 48h
3. **Prova de leitura do contrato** — exigir scroll até o fim antes de habilitar checkbox de aceite
4. **Histórico de tentativas de assinatura** — tabela `ContratoTentativa` para auditar falhas recorrentes
5. **Rollback automático de escalação** — conversa escalada para humano nunca retorna para IA; timeout de 30min sem resposta deveria reativar IA

### Observabilidade
1. **Adicionar testes automatizados** — ao menos para os webhooks críticos
2. ~~**Monitorar cron jobs**~~ — ✅ Sentry Cron Monitoring implementado em todos os crons (`cron-reconciliar-notas`, `cron-retry-documentos`, `cron-email-sync`)
3. **Métricas de RAG** — taxa de hit, latência de busca

### Code Quality
1. **Corrigir typo `atudalizarDadosCliente`** em todas as referências
2. **Remover `src/middleware.ts`** — causa confusão e pode causar bugs
3. **Atualizar `docs/ia-arquitetura.md`** — está desatualizado

---

## 🔄 Memória do Projeto (Resumo para Próximo Desenvolvedor)

### Regras Imutáveis

| Regra | Motivo |
|-------|--------|
| NUNCA `prisma db push` | Bypassa migrations → erros P2022 em produção |
| NUNCA tocar `src/middleware.ts` | Coexistência com proxy.ts causa build error |
| SEMPRE `try/catch` explícito | Zero erros silenciosos — regra de produção |
| SEMPRE `Sentry.captureException()` nos catch | Rastreabilidade em produção |
| Build local antes de commit | Deploy CI falha por erros TS |
| Deploy exige tag `v*` | `git push origin main` sozinho não dispara CI |
| Cron VPS = config manual | Deploy não configura crontab automaticamente |

### Convenções de Código

- Componentes client: `"use client"` no topo
- APIs protegidas: `getServerSession()` antes de qualquer operação
- Webhooks: verificar `WebhookLog` para idempotência
- Interações: sempre registrar via `registrarInteracao()` para feed de atividades
- Notificações: `criarNotificacao()` para alertas no sino do CRM

### Infra VPS

- Host: `82.25.79.193`
- Usuário deploy: `deploy`
- PostgreSQL: porta `32768`
- DocuSeal: porta `32825`
- CI/CD: ghcr.io → 6 containers Docker
- Backup: automático (verificar configuração)
