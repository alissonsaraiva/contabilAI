---
name: project_cron_email_sync_desabilitado
description: "Cron de sync de email (POST /api/email/sync, */2 min) desabilitado na VPS em 2026-05-20 — reabilitar quando módulo de email voltar a ser usado"
metadata: 
  node_type: memory
  type: project
  originSessionId: c79cd68a-b706-4a3b-8204-180a4f2af363
---

# Cron `/api/email/sync` está DESABILITADO na VPS

**Data:** 2026-05-20
**Motivo:** módulo de email não está sendo usado — evitar tráfego e uso desnecessário da VPS

**Linha no crontab (`ssh deploy@82.25.79.193 "crontab -l"`):**
```
# [desabilitado 2026-05-20 - não estamos usando email no momento] */2 * * * * curl -s -X POST https://crm.avos.digital/api/email/sync -H "Authorization: Bearer ..." > /dev/null 2>&1
```

## Quando reabilitar

Se o módulo de email voltar a ser usado (qualquer feature que dependa de pull de mensagens via `/api/email/sync`):

1. `ssh deploy@82.25.79.193 "crontab -e"`
2. Remover o prefixo `# [desabilitado 2026-05-20 - não estamos usando email no momento] ` da linha
3. Salvar — cron volta a rodar a cada 2 min

**Verificar funcionamento depois de reabilitar:**
- Logs do app: `docker logs contabai_app --since=5m 2>&1 | grep -i 'email/sync'`
- Healthchecks.io se houver instrumentação (ver [[feedback_cron_healthchecks]])

## Sinais de que precisa reabilitar

- Feature de leitura de emails reclamando que não recebe mensagens novas
- Alisson reativar o módulo de email no produto
- Qualquer integração nova que dependa de inbox sincronizado

Ver também: [[project_vps_access]], [[feedback_cron_vps]]
