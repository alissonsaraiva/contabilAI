---
name: project_integra_contador_pendencias
description: Pendências do Integra Contador (SERPRO) após MVP — procuração digital + portal do cliente (itens 1 e 2 concluídos em v3.10.28)
type: project
---

## Status das pendências (atualizado 2026-04-06)

### 1 — Portal do Cliente: Tela de Procuração SERPRO ✅ CONCLUÍDO (v3.10.28)

Implementado:
- `/portal/procuracao-rf` — página dedicada com status em destaque (verde/vermelho)
- Botão **"Já autorizei — verificar agora"** → chama `POST /api/portal/procuracao-rf` (aciona SERPRO ou degrada graciosamente)
- Passo a passo do e-CAC (5 etapas) + seção "Por que é necessária"
- Banner vermelho em `/portal/financeiro` quando procuração pendente (linkar à página)
- Throttle: 10 min entre verificações manuais

### 2 — Verificação automática de procuração ✅ CONCLUÍDO (v3.10.28)

Implementado:
- Cron diário `POST /api/cron/verificar-procuracao-rf` (schedule: `0 9 * * *`)
- Cadência: MEI sem procuração → verifica 1x/dia; MEI com procuração ativa → verifica a cada 30 dias
- Atualiza `Empresa.procuracaoRFAtiva` + `Empresa.procuracaoRFVerificadaEm`
- Aborta graciosamente se módulo `integra-procuracoes` não contratado ou `Escritorio.cnpj` não configurado
- HC: `HC_VERIFICAR_PROCURACAO_RF`

**CRM — alertas implementados**:
- Lista de clientes: badge `Proc. RF` vermelho para MEI com `procuracaoRFAtiva = false`
- Detalhe do cliente: banner de alerta com data da última verificação

### 3 — (Futuro) Gov.br OAuth

- Permitir que o cliente logue no portal via gov.br e conceda procuração programaticamente
- Feature grande — avaliar viabilidade separadamente

### Referência de arquivos implementados

| Arquivo | Descrição |
|---------|-----------|
| `src/app/api/cron/verificar-procuracao-rf/route.ts` | Cron de verificação |
| `src/app/api/portal/procuracao-rf/route.ts` | GET status + POST verificar |
| `src/components/portal/portal-procuracao-client.tsx` | Componente portal |
| `src/app/(portal)/portal/(autenticado)/procuracao-rf/page.tsx` | Página portal |

### Módulo SERPRO

- Endpoint: `GET /integra-procuracoes/v1/procuracao/{cnpjOutorgante}/{cnpjOutorgado}`
- `cnpjOutorgado` = CNPJ do escritório (em `Escritorio.cnpj`)
- `cnpjOutorgante` = CNPJ do cliente (em `Empresa.cnpj`)
- Função: `consultarProcuracao(cnpjCliente, cnpjEscritorio)` em `src/lib/services/integra-contador.ts`
