---
name: feedback_cron_vps
description: Ao desenvolver ou alterar feature que envolve cron, sempre configurar na VPS manualmente via crontab
type: feedback
---

Ao criar ou alterar qualquer endpoint de cron (`/api/cron/*` ou `/api/agente/cron`), sempre configurar o job na VPS — o deploy não faz isso automaticamente.

**Why:** O crontab da VPS é gerenciado pelo SO, completamente fora do pipeline de deploy. Descoberto em 2026-04-02 que `agente/cron` e `retry-documentos` existiam no código mas nunca tinham sido configurados na VPS.

**How to apply:**
- Usuário: `deploy` na VPS `82.25.79.193`
- CRON_SECRET: disponível no container `contabai_app` — usar `docker inspect contabai_app` para obter
- URL base: `https://crm.avos.digital`
- Autenticação: header `Authorization: Bearer <CRON_SECRET>`
- Comando para editar: `crontab -u deploy -l | { cat; echo '<nova linha>'; } | crontab -u deploy -`
- Comando para verificar: `crontab -l -u deploy`

**Crons ativos em 2026-04-02:**
- `* * * * *` — `/api/whatsapp/processar-pendentes` (loop interno a cada 5s)
- `* * * * *` — `/api/agente/cron`
- `0 * * * *` — `/api/cron/retry-documentos`
