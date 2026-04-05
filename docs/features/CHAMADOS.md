# CHAMADOS — Suporte e Escalação

> **Sistema:** AVOS v3.10.23 | **Fonte:** `SISTEMA.md` (extraído)

---

## Fluxo de Chamado (Suporte)

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

## Fluxo de Escalação

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

## Rotas

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/crm/chamados` | GET/POST | Listar / criar chamado |
| `/api/crm/chamados/[id]` | GET | Detalhe do chamado |
| `/api/crm/chamados/[id]` | PATCH (JSON) | Atualizar status, resposta, nota interna |
| `/api/crm/chamados/[id]` | PATCH (multipart) | Resolver com arquivo + canais de entrega |
| `/api/portal/chamados` | Portal session | Listar/criar chamados |

## Service `resolverOS` (`src/lib/services/chamados.ts`)

Orquestrador central de resolução de chamado — chamado por `PATCH /api/crm/chamados/[id]`:

```
1. Atualiza Chamado (status=resolvida, resposta, respondidoPorId, fechadoEm)
2. Se arquivo novo → criarDocumento() → S3 + banco + RAG (com vínculo chamadoId)
3. Se documento existente → vincula à OS sem upload (reutiliza URL)
4. Se canal_email → enviarEmailComHistorico() com doc como anexo
5. Se canal_whatsapp → envio para titular:
   a. sendText() com mensagem de texto
   b. prepararEntregaWhatsApp() + sendMedia()
   c. Registra interação 'whatsapp_enviado'
5b. Se destinatários adicionais (sócios) → repete passo 5 para cada um
6. registrarInteracao('os_resolvida') no histórico
7. sendPushToCliente() — push notification para o portal (fire-and-forget)
```

## PATCH JSON Aceita

- `status` — novo status (`em_andamento`, `aguardando_cliente`, `resolvida`, `cancelada`)
- `resposta` — texto visível ao cliente no portal
- `nota_interna` — cria um `ChamadoNota` (só visível no CRM, nunca enviado ao cliente)
- `prioridade` — `baixa`, `media`, `alta`

## PATCH multipart (resolução completa)

- `resposta`, `categoria`, `arquivo` (File) ou `documento_id/url/nome/mime` (doc existente)
- `canal_email=1`, `email_assunto`, `email_corpo`
- `canal_whatsapp=1`, `wpp_mensagem`, `wpp_destinatarios` (JSON array de sócios)

## Modelo ChamadoNota

**Tabela**: `chamado_notas`  
**Campos**: `chamadoId`, `conteudo`, `autorId`, `criadoEm`  
**Visual**: fundo âmbar + ícone de cadeado na timeline  
**Regra**: nunca exposta no portal do cliente

## Status do Chamado (Enum StatusOS)

```
aberta | em_andamento | aguardando_cliente | resolvida | cancelada
```

## Status da Escalação (Enum StatusEscalacao)

```
pendente | em_atendimento | resolvida
```

## Canal de Escalação (Enum CanalEscalacao)

```
whatsapp | onboarding | portal
```
