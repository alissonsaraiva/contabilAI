---
name: project_calendario_fiscal
description: Calendário fiscal por tipo de cliente (MEI, autônomo PF, EPP) para base das automações de lembretes proativos via WhatsApp/portal
type: project
---

# Calendário Fiscal por Tipo de Cliente

Mapeado para servir de base para automações de lembrete proativo (cron + WhatsApp + portal).
Público-alvo: autônomos (médicos, dentistas), MEI, EPP.

## MEI

| Obrigação | Vencimento | Frequência | Prioridade |
|---|---|---|---|
| DAS-MEI | Dia 20 de cada mês | Mensal | Alta |
| DASN-SIMEI (declaração anual) | 31 de maio | Anual | Alta |
| NF-S-e (emissão a pedido) | Sob demanda | Variável | Alta |
| Certificado MEI (renovação CNPJ) | Quando solicitado | — | Média |

## Autônomo / Profissional Liberal (PF — médico, dentista, etc.)

| Obrigação | Vencimento | Frequência | Prioridade |
|---|---|---|---|
| Carnê-Leão (DARF) | Último dia útil do mês seguinte | Mensal | Alta |
| IRPF — entrega da declaração | 31 de maio (prazo comum) | Anual | Alta |
| IRPF — quota única ou 1ª quota | 31 de maio | Anual | Alta |
| IRPF — quotas restantes (2ª a 8ª) | Último dia útil de jun–dez | Mensal (jul–nov) | Média |
| NF-S-e (emissão a pedido) | Sob demanda | Variável | Alta |
| INSS autônomo (GPS) | Dia 20 do mês seguinte | Mensal | Alta |
| e-Social (se tem empregado doméstico) | Variável | — | Média |

## EPP / ME (Simples Nacional)

| Obrigação | Vencimento | Frequência | Prioridade |
|---|---|---|---|
| DAS-Simples | Dia 20 de cada mês | Mensal | Alta |
| PGDAS-D (apuração) | Dia 20 de cada mês | Mensal | Alta |
| DEFIS (declaração anual Simples) | 31 de março | Anual | Alta |
| e-Social (folha) | Dia 7 do mês seguinte | Mensal | Alta |
| DCTF (se apura IRPJ/CSLL fora Simples) | Dia 15 do 2º mês seguinte | Mensal | Média |
| EFD-Reinf (retenções) | Dia 15 do mês seguinte | Mensal | Média |
| RAIS | Março/Abril (prazo varia) | Anual | Alta |
| CAGED (admissões/demissões) | Dia 7 do mês seguinte | Mensal (quando houver mov.) | Média |
| NF-e / NF-S-e | Sob demanda | Variável | Alta |
| Certificado digital A1/A3 | Renovação anual/trienal | — | Média |

## Datas fixas relevantes (todos os tipos)

| Data | Evento |
|---|---|
| Janeiro | SIMEI (MEI) — declaração do ano anterior até 31/maio mas muitos escritórios iniciam jan |
| Março/Abril | Abertura da temporada de IRPF |
| 31 de Março | DEFIS (Simples Nacional) |
| 31 de Maio | IRPF prazo final + DASN-SIMEI |
| Agosto | Verificar quotas IRPF em atraso |
| Dezembro | Planejamento tributário do ano seguinte |

## Como usar nas automações

- Campo `tipoContribuinte` no Cliente (`pf` ou `pj`) + `regime` define quais lembretes disparar
- Cron verifica mensalmente quais clientes têm obrigações nos próximos 7 dias
- Disparo via WhatsApp (texto) + notificação no portal
- Template por tipo: "Olá [nome], lembrete: seu DAS-MEI de [mês] vence dia 20. Qualquer dúvida estou aqui."
- Para IRPF: lembrete em 3 etapas — 60 dias antes, 15 dias antes, 5 dias antes

## Why

Mapeado em 2026-03-28 a pedido do usuário. Público-alvo definido: autônomos (médicos, dentistas), MEI, EPP.
Calendário será base para tool `lembrarObrigacaoFiscal` e templates de WhatsApp proativos.

## How to apply

Quando implementar automações de lembrete: usar este calendário como fonte de verdade.
Criar tool `lembrarObrigacaoFiscal` e endpoint de cron mensal por tipo de cliente.
