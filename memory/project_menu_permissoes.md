---
name: project_menu_permissoes
description: Permissões de menu por perfil (admin/contador/assistente) — arquitetura, arquivos, comportamento de propagação e regras
type: project
---

# Permissões de Menu por Perfil — v3.10.32 (2026-04-06)

Implementado controle dinâmico de quais menus cada perfil acessa no CRM.

## Estado atual

- **3 perfis**: `admin` (acesso total fixo), `contador` (configurável), `assistente` (configurável)
- **Admin**: sempre tem tudo — não é configurável, nunca pode ser bloqueado
- **Configurações** (`/crm/configuracoes`): configurável — por default desabilitado para contador e assistente
- **Defaults** (quando `null` no banco): contador tem tudo exceto Configurações; assistente tem ~80% (sem Reajuste e Configurações)

## MENUS_DISPONIVEIS — 13 itens (v3.10.32)

Todo item deve ter: página existente + entrada em NAV_GROUPS do sidebar + entrada em MENUS_DISPONIVEIS.
**Se qualquer uma das três estiver faltando, o menu não deve estar listado.**

| href | label | Grupo |
|------|-------|-------|
| /crm/dashboard | Dashboard | Comercial |
| /crm/prospeccao | Prospecção | Comercial |
| /crm/leads | Onboarding | Comercial |
| /crm/clientes | Clientes | Comercial |
| /crm/empresas | Empresas | Comercial |
| /crm/atendimentos | Atendimentos | Atendimento |
| /crm/chamados | Chamados | Atendimento |
| /crm/emails | E-mails | Atendimento |
| /crm/comunicados | Comunicados | Comunicação |
| /crm/financeiro/inadimplentes | Inadimplentes | Financeiro |
| /crm/financeiro/reajuste | Reajuste | Financeiro |
| /crm/relatorios | Relatórios IA | Inteligência |
| /crm/configuracoes | Configurações | Configurações |

## Arquivos chave

| Arquivo | Papel |
|---------|-------|
| `src/lib/menu-permissoes.ts` | MENUS_DISPONIVEIS (13 itens), DEFAULT_PERMISSOES, resolverPermissoes(), podeAcessarRota() — Edge-compatível |
| `src/proxy.ts` | Middleware: lê token.menuPermissoes do JWT e redireciona para /crm/acesso-negado se não autorizado |
| `src/lib/auth.ts` | jwt callback: carrega menuPermissoes do banco no login; session callback: recarrega a cada 5 min |
| `src/components/layout/crm-sidebar.tsx` | NAV_GROUPS + filtra itens visíveis via podeAcessarRota() |
| `src/components/crm/menu-permissoes-config.tsx` | UI de checkboxes por perfil, na página /crm/configuracoes/usuarios |
| `src/app/api/configuracoes/menu-permissoes/route.ts` | GET/PATCH — admin-only, Zod + Sentry |
| `src/app/(crm)/crm/acesso-negado/page.tsx` | Página de acesso negado com botão para /crm/dashboard |

## Adicionar / editar / remover menu no CRM

**OBRIGATÓRIO**: manter os 3 arquivos sempre sincronizados:

### Adicionar novo menu
1. Criar página em `src/app/(crm)/crm/<rota>/page.tsx`
2. Adicionar em `NAV_GROUPS` do `crm-sidebar.tsx`
3. Adicionar em `MENUS_DISPONIVEIS` do `menu-permissoes.ts` (mesmo href)
4. Decidir se entra em `DEFAULT_PERMISSOES.contador` e/ou `.assistente`

### Remover menu
1. Deletar a página
2. Remover de `NAV_GROUPS` do `crm-sidebar.tsx`
3. Remover de `MENUS_DISPONIVEIS` do `menu-permissoes.ts`
4. Remover de `DEFAULT_PERMISSOES` (contador e assistente)

### Renomear/mover rota
- Atualizar o `href` nos 3 lugares: `NAV_GROUPS`, `MENUS_DISPONIVEIS`, `DEFAULT_PERMISSOES`
- Qualquer discrepância causa item fantasma (aparece na config mas não abre) ou menu sem proteção

**Why:** Em v3.10.32 foi encontrado item fantasma `/crm/financeiro/funcionarios` — estava em MENUS_DISPONIVEIS e DEFAULT_PERMISSOES mas sem página e sem entrada no sidebar. Causaria 404 se habilitado.

## Propagação de mudanças

Admin salva → banco atualizado → próxima revalidação de sessão (≤ 5 min) → token.menuPermissoes atualizado no cookie → middleware usa permissões novas.

**Why:** delay de 5 min é intencional (mesmo intervalo de verificação de ativo/precisaTrocarSenha).

**How to apply:** ao depurar "por que o usuário ainda tem acesso", considerar que pode levar até 5 min para propagar.

## ROTAS_LIVRES (middleware bypass de permissão de menu)

`/crm/acesso-negado`, `/crm/trocar-senha`, `/crm/dashboard` — sempre acessíveis para usuários autenticados com tipo válido.

## Schema

```prisma
model Escritorio {
  menuPermissoes Json?  // { contador: string[], assistente: string[] }
}
```
Migration: `20260406234758_add_menu_permissoes`
`null` = usa DEFAULT_PERMISSOES hardcoded (retrocompatível).

## Documentação completa

`docs/features/USUARIOS.md`
