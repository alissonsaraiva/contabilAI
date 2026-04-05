# ONBOARDING — Fluxo Lead → Cliente

> **Sistema:** AVOS v3.10.23 | **Fonte:** `SISTEMA.md` (extraído)

---

## Etapas do Wizard

```
stepAtual  status                Página                         Descrição
─────────────────────────────────────────────────────────────────────────
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

## Fluxo Detalhado

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

## APIs Públicas do Onboarding

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

> ⚠️ **`/api/leads/:id` (GET/PUT) requer autenticação** — nunca usar direto no wizard público. Usar sempre `/api/onboarding/lead/:id` (GET) e `/api/onboarding/salvar-progresso` (POST).

## Validações

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

## Segurança do Webhook ZapSign

```
Autenticação: header X-ZapSign-Secret (preferencial) ou ?secret= (query param, legado compatível)
Idempotência: check de status DENTRO da $transaction previne race conditions
Race P2002: recuperação via $transaction atômica (não duas queries separadas)
Dados pessoais: CPF/email/nome NÃO enviados como extra no Sentry (LGPD)
```

**Configuração no painel ZapSign**: URL `https://seudominio/api/webhooks/zapsign` com header `X-ZapSign-Secret: {valor_do_zapsignWebhookSecret}`. Query param `?secret=` ainda funciona por compatibilidade mas é desaconselhado (aparece em logs de acesso).

## Conversão Lead → Cliente (webhook ZapSign)

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

## Auto-save (useAutoSave hook)

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
