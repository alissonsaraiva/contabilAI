---
name: Skills disponíveis no projeto ContabilAI
description: Lista de skills instaladas em .agent/skills/ — invocar com /nome-da-skill quando a tarefa se encaixar
type: project
---

# Skills do Projeto

Localização: `.agent/skills/` (no .gitignore)
Copiadas de: `/Users/alissonsaraiva/projetos/passagem-servico/.agent/skills/`

## Skills customizadas do AVOS (criadas em 2026-04-13)

| Skill | Quando usar |
|-------|-------------|
| `avos-pre-implementacao` | **SEMPRE** antes de qualquer feature, bug fix ou refactor — protocolo obrigatório |
| `avos-modulos-criticos` | Ao tocar WhatsApp chat, portal chat, NFS-e, RAG CRUD ou SSE streams |
| `avos-deploy` | Antes de criar tag e publicar versão — checklist completo + fluxo CI |
| `error-handling-patterns` | Ao escrever qualquer operação async crítica — try/catch/finally/Sentry |

## Skills genéricas disponíveis

| Skill | Quando usar |
|-------|-------------|
| `api-patterns` | Desenhar ou revisar padrões de API REST/RPC |
| `app-builder` | Scaffolding e estruturação de novas features/apps |
| `architecture` | Decisões de arquitetura, trade-offs, ADRs |
| `bash-linux` | Scripts shell, automações, comandos Linux |
| `behavioral-modes` | Ajustar comportamento do agente (modos: cauteloso, rápido, etc.) |
| `brainstorming` | Sessões de ideação e exploração de soluções |
| `clean-code` | Revisar e refatorar código para clareza e simplicidade |
| `code-review-checklist` | Checklist estruturado para revisão de PRs |
| `database-design` | Modelagem de banco, schemas, relacionamentos |
| `deployment-procedures` | Procedimentos e runbooks de deploy |
| `documentation-templates` | Templates padronizados de documentação |
| `frontend-design` | Padrões de componentes, layout e UX no frontend |
| `geo-fundamentals` | Fundamentos de geolocalização e geo-queries |
| `i18n-localization` | Internacionalização e localização de strings |
| `intelligent-routing` | Lógica de roteamento inteligente (proxy, API gateway) |
| `lint-and-validate` | Configuração e execução de linters e validadores |
| `mcp-builder` | Construção de MCP servers e ferramentas de agente |
| `mobile-design` | Diretrizes de design para mobile/responsivo |
| `nextjs-react-expert` | Padrões avançados Next.js App Router + React |
| `nodejs-best-practices` | Boas práticas Node.js (async, error handling, etc.) |
| `parallel-agents` | Orquestração de múltiplos agentes em paralelo |
| `performance-profiling` | Profiling, identificação de gargalos, otimização |
| `plan-writing` | Escrita de planos de implementação estruturados |
| `python-patterns` | Padrões e boas práticas Python |
| `red-team-tactics` | Testes de segurança ofensivos (contexto autorizado) |
| `rust-pro` | Desenvolvimento Rust avançado |
| `seo-fundamentals` | Fundamentos de SEO técnico e on-page |
| `server-management` | Gestão de servidores, SSH, manutenção |
| `systematic-debugging` | Processo estruturado de debugging |
| `tailwind-patterns` | Padrões de uso do Tailwind CSS |
| `tdd-workflow` | Fluxo de Test-Driven Development |
| `testing-patterns` | Padrões de testes (unit, integration, e2e) |
| `ui-ux-pro-max` | UX/UI avançado, heurísticas, fluxos de usuário |
| `vulnerability-scanner` | Varredura e análise de vulnerabilidades |
| `web-design-guidelines` | Diretrizes gerais de design web |
| `webapp-testing` | Testes de aplicações web (funcionais, regressão) |

**How to apply:** Quando uma tarefa se encaixar em uma dessas categorias, invocar a skill correspondente antes de começar — ela carrega contexto especializado que melhora a qualidade da resposta.
