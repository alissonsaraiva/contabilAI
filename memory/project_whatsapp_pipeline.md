---
name: WhatsApp Pipeline — Arquitetura Completa
description: Pipeline modular de processamento de WhatsApp — novo módulo src/lib/whatsapp/pipeline/ (v3.10.7, auditado 2026-04-02)
type: project
---

## Arquitetura (src/lib/whatsapp/)

Módulo completamente refatorado em v3.10.x com pipeline modular e arquivo de constantes centralizadas.

### Constantes (constants.ts)
- `RATE_LIMIT_MS = 5000` — mínimo entre respostas
- `MAX_MSG_LENGTH = 4096` — limite de caracteres
- `PHONE_CACHE_TTL_MS = 86400000` — cache de 24h para identificação de contato
- `JAILBREAK_PATTERNS` — regex para detectar manipulação do prompt

### Pipeline de Processamento

```
/api/whatsapp/webhook (Evolution API)
    ↓
Filtrar (grupos, broadcast, status)
    ↓
Rate limit: RATE_LIMIT_MS
    ↓
identificarContato() → Cliente | Lead | Sócio | Prospect
  └── cache 24h no banco (invalidado na conversão Lead→Cliente)
    ↓
Buscar/criar ConversaIA (por remoteJid)
    ↓
Lock distribuído via processandoEm (evita duplo processamento)
⚠️ RISCO: sem timeout no lock — se instância cair, conversa trava
    ↓
Arquivar mídia: arquivarMidia() → R2 storage
  └── Áudio → transcrever (Whisper)
  └── Imagem → base64 para Claude (visão)
  └── PDF → extrair texto + resumir
    ↓
ask() → resposta IA (ou agente se canal crm)
  └── ##HUMANO## → criar Escalação + pausar conversa
    ↓
sendHumanLike() → Evolution API
    ↓
Salvar MensagemIA
```

### Arquivos Novos (v3.10.x)
- `src/lib/whatsapp/constants.ts` — constantes centralizadas
- `src/lib/whatsapp/identificar-contato.ts` — identificação com cache
- `src/lib/whatsapp/arquivar-midia.ts` — salvar mídia no R2
- `src/lib/whatsapp/pipeline/` — etapas modularizadas

### Cron de Processamento
`/api/whatsapp/processar-pendentes` — processa fila de mensagens pendentes
Configurar no crontab VPS: `*/1 * * * * curl ... /api/whatsapp/processar-pendentes`

### Ponto de Falha Crítico
Webhook WhatsApp (`/api/whatsapp/webhook`) **não valida autenticidade do payload** — qualquer um pode postar mensagens falsas para o endpoint.

**Why:** Arquitetura foi construída sem HMAC de verificação
**How to apply:** Ao implementar qualquer coisa no webhook, adicionar validação de IP ou HMAC da Evolution API antes de processar
