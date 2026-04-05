# EMAIL — IMAP Sync e Threading

> **Sistema:** AVOS v3.10.23 | **Fonte:** `SISTEMA.md` (extraído)

---

## Fluxo de Email (IMAP Sync)

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

## Resiliência IMAP (v3.10.10)

`imap.ts` trata desconexão mid-fetch sem perder emails já coletados:

- `client.on('error', () => {})` evita `uncaughtException` quando servidor fecha socket
- Erro `NoConnection` durante iteração → emails parciais são válidos; reconecta apenas para marcar `\Seen`
- `getImapConfig()` retorna `null` (sem throw) se credenciais ausentes — sync pula silenciosamente
- `testarConexaoImap()` disponível para diagnóstico via UI

## Rotas

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/email/inbox` | GET | Listar inbox IMAP (paginado) |
| `/api/email/inbox/[id]/vincular` | POST | Vincular email a cliente/lead |
| `/api/email/inbox/[id]/arquivar-anexo` | POST | Arquivar anexo no R2 |
| `/api/email/enviar` | POST | Enviar email SMTP |
| `/api/email/sync` | POST | Sincronizar IMAP (cron, precisa CRON_SECRET) |

## Configuração

- Credenciais por escritório: salvas no banco (`Escritorio`) — não em `.env`
- Frequência do cron: a cada 5 min (`*/5 * * * *`)
- Monitor healthchecks.io: `HC_EMAIL_SYNC`

## Arquivos

- `src/lib/email/imap.ts` — Recebimento IMAP (imapflow)
- `src/lib/email/send.ts` — Envio SMTP (nodemailer + Resend)
- `src/lib/email/processar.ts` — Pipeline de processamento
- `src/lib/email/com-historico.ts` — Threading de emails
