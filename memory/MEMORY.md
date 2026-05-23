# Memory Index

## Estado & Progresso (ler sempre no início de sessão)
- [current_state.md](current_state.md) — **SNAPSHOT**: versão v3.10.42, features recentes, bloqueios, débito técnico
- [progress_log.md](progress_log.md) — **CONTINUIDADE**: o que foi feito/pendente em cada sessão, próximo passo natural
- [known_issues_patterns.md](known_issues_patterns.md) — **DIAGNÓSTICO**: catálogo de bugs reais com causa raiz — consultar antes de investigar
- [project_backlog_decisoes.md](project_backlog_decisoes.md) — **BACKLOG**: decisões pendentes (segurança, portal, IA, integrações, produto, tech debt)

## Usuário
- [user_alisson.md](user_alisson.md) — Perfil do Alisson — engenheiro, co-fundador, domínio técnico avançado

## Projeto — Visão Geral
- [project_contabai.md](project_contabai.md) — Visão geral AVOS: stack, infra, módulos, subdomínios — v3.9.5+
- [project_branding_dinamico.md](project_branding_dinamico.md) — Branding dinâmico via getEscritorioConfig() — nunca hardcodar
- [project_design_patterns.md](project_design_patterns.md) — Padrões visuais CRM: MD3, cards, tabelas, badges, tipografia
- [project_skills.md](project_skills.md) — Skills em .agent/skills/: lista com quando usar cada uma

## Projeto — Infra & Deploy
- **Runbook de provisionamento:** `docs/INFRA.md` (no repo) — passo a passo para subir VPS nova do zero
- [project_vps_infra.md](project_vps_infra.md) — VPS: 6 containers, UFW, disco 14 GB — auditado 2026-04-03
- [project_vps_access.md](project_vps_access.md) — **OBRIGATÓRIO antes de acessar VPS**: comandos, containers, credenciais PG

## Projeto — Arquitetura & Módulos
- [project_ai_chat_roadmap.md](project_ai_chat_roadmap.md) — 4 IAs: providers, RAG hybrid search, agente operacional
- [project_agente_operacional.md](project_agente_operacional.md) — Agente CRM: 40+ tools, permissões por canal, cron, toggles
- [project_rag_audit.md](project_rag_audit.md) — RAG v3.5: hybrid search, similarity 0.72, ingestores
- [project_whatsapp_pipeline.md](project_whatsapp_pipeline.md) — Pipeline WhatsApp v3.10.x: módulos, fluxo, ponto de falha crítico
- [project_document_architecture.md](project_document_architecture.md) — Documentos v3.3: 7 serviços, PJ/PF split, OS+documento
- [project_nfse_spedy.md](project_nfse_spedy.md) — NFS-e Spedy: emissão, cancelamento, webhook, 5 tools — IMPLEMENTADA
- [project_notifications.md](project_notifications.md) — Notificações CRM: endpoint, hook, dropdown sino
- [project_atendimentos.md](project_atendimentos.md) — Atendimento humano: assumir/devolver IA, drawer WhatsApp, escalações
- [project_empresa_architecture.md](project_empresa_architecture.md) — Empresa como entidade central: schema, session, sócios
- [project_multi_empresa.md](project_multi_empresa.md) — Migração 1:1→1:N: 43 arquivos, 4 fases (2026-04-10)
- [project_menu_permissoes.md](project_menu_permissoes.md) — Permissões menu por perfil v3.10.29
- [project_portal_v3.md](project_portal_v3.md) — Portal v3.2: páginas, APIs, OS, Comunicado, PWA
- [project_cnpj_feature.md](project_cnpj_feature.md) — CNPJ auto-fill: service+proxy+hook, useCnpj()
- [project_docuseal.md](project_docuseal.md) — DocuSeal self-hosted: assinatura eletrônica
- [project_calendario_fiscal.md](project_calendario_fiscal.md) — Calendário fiscal MEI/PF/EPP: obrigações, vencimentos

## Projeto — Decisões Pendentes
- [project_portal_chat.md](project_portal_chat.md) — Chat Clara: 4 decisões pendentes
- [project_whatsapp_identity.md](project_whatsapp_identity.md) — Verificação identidade WhatsApp: 4 opções, recomendação PIN
- [project_proximos_passos.md](project_proximos_passos.md) — Próximos passos: chamados, documentos, debounce, lembretes, NFS-e
- [project_openfinance_pluggy.md](project_openfinance_pluggy.md) — Open Finance Pluggy: plano completo — backlog
- [project_asaas_integration.md](project_asaas_integration.md) — Integração Asaas: schema, rotas, webhook — pronto p/ implementar
- [project_integra_contador_pendencias.md](project_integra_contador_pendencias.md) — Integra Contador: itens 1-2 concluídos, gov.br OAuth pendente

## Projeto — Estado de Infra (atenção)
- [project_cron_email_sync_desabilitado.md](project_cron_email_sync_desabilitado.md) — ⚠️ Cron `/api/email/sync` DESABILITADO na VPS (2026-05-20) — reabilitar quando módulo email voltar

## Projeto — Histórico
- [project_tarefas_removed.md](project_tarefas_removed.md) — Módulo tarefas DELETADO — não existe mais
- [project_inconsistencias.md](project_inconsistencias.md) — Débito técnico auditoria 2026-04-02: typos, webhook, lock, docs

## Feedbacks — Postura
- [feedback_honestidade.md](feedback_honestidade.md) — **CENTRAL**: ser honesto e direto, nunca agir para agradar — questionar, admitir erros, apontar falhas

## Feedbacks — Regras de Código (consolidadas no AGENTS.md)
- [feedback_pre_implementation_protocol.md](feedback_pre_implementation_protocol.md) — Protocolo pré-implementação obrigatório
- [feedback_diagnostic_rigor.md](feedback_diagnostic_rigor.md) — Diagnóstico profundo, proibido quick fix
- [feedback_vps_diagnostico.md](feedback_vps_diagnostico.md) — Bugs com dados reais: acessar VPS no início da investigação, não no final
- [feedback_error_logging_standard.md](feedback_error_logging_standard.md) — Try/catch + logs rastreáveis, zero catch vazio
- [feedback_sentry_obrigatorio.md](feedback_sentry_obrigatorio.md) — Sentry.captureException em todo catch crítico
- [feedback_componentizacao.md](feedback_componentizacao.md) — Sempre componentizar, código limpo
- [feedback_proactive_checks.md](feedback_proactive_checks.md) — Grep pelo mesmo padrão em outros arquivos ao corrigir bug
- [feedback_pre_deploy_checks.md](feedback_pre_deploy_checks.md) — tsc + build antes de commitar
- [feedback_prisma_migrations.md](feedback_prisma_migrations.md) — Nunca db push, sempre migrate dev
- [feedback_deploy_tag.md](feedback_deploy_tag.md) — Deploy exige tag v*
- [feedback_proxy_middleware.md](feedback_proxy_middleware.md) — Só proxy.ts, nunca middleware.ts
- [feedback_idioma.md](feedback_idioma.md) — Sempre pt-BR
- [feedback_testes_obrigatorios.md](feedback_testes_obrigatorios.md) — Testes unitários + integração obrigatórios em toda feature/bug fix

## Feedbacks — Regras de Domínio
- [feedback_rag_first.md](feedback_rag_first.md) — Nova feature → avaliar RAG + quais IAs acessam
- [feedback_agent_tool_vs_feature.md](feedback_agent_tool_vs_feature.md) — Tool vs feature fixa: avaliar antes
- [feedback_onboarding_chat_context.md](feedback_onboarding_chat_context.md) — Código vs CRM no chat onboarding
- [feedback_onboarding_save.md](feedback_onboarding_save.md) — POST salvar-progresso, nunca PUT leads/:id
- [feedback_cron_vps.md](feedback_cron_vps.md) — Cron: configurar crontab na VPS manualmente
- [feedback_cron_healthchecks.md](feedback_cron_healthchecks.md) — Cron: instrumentar healthchecks.io
- [feedback_documentacao_fonte_verdade.md](feedback_documentacao_fonte_verdade.md) — docs/ é fonte de verdade
- [feedback_docs_memory_update.md](feedback_docs_memory_update.md) — Atualizar docs + memórias após alteração
