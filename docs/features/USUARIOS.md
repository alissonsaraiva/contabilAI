# USUÁRIOS & PERMISSÕES DE MENU

> **Sistema:** AVOS v3.10.29 | **Implementado:** 2026-04-06 | **Atualizado:** 2026-04-17
>
> Controle de acesso ao CRM por perfil de usuário, incluindo configuração dinâmica de menus via painel admin.

---

## Visão Geral

O sistema de usuários tem **3 perfis** (`TipoUsuario` no Prisma):

| Perfil | Acesso CRM | Configurações | Menus |
|--------|-----------|---------------|-------|
| `admin` | ✅ Total | ✅ | Todos — fixo, não configurável |
| `contador` | ✅ | ❌ | Configurável via painel |
| `assistente` | ✅ | ❌ | Configurável via painel |

O assistente foi habilitado para entrar no CRM nesta versão. Antes era bloqueado.

---

## Arquivos Chave

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/lib/menu-permissoes.ts` | Mapa canônico de menus, defaults por role, `resolverPermissoes()`, `podeAcessarRota()` — Edge-compatível |
| `src/proxy.ts` | Middleware: valida token + verifica permissão de rota via JWT antes de qualquer render |
| `src/lib/auth.ts` | JWT callbacks: injeta `menuPermissoes` no token no login; recarrega a cada 5 min |
| `src/components/layout/crm-sidebar.tsx` | Sidebar: filtra itens visíveis via `podeAcessarRota()` dinamicamente |
| `src/components/crm/menu-permissoes-config.tsx` | UI de checkboxes para configurar menus por perfil (admin-only) |
| `src/app/(crm)/crm/configuracoes/usuarios/page.tsx` | Página de usuários: carrega `menuPermissoes` do escritório para a UI — seleciona `whatsapp` no query |
| `src/app/(crm)/crm/acesso-negado/page.tsx` | Página de acesso negado com botão de volta ao dashboard |
| `src/app/api/configuracoes/menu-permissoes/route.ts` | GET/PATCH das permissões — requer `tipo === 'admin'` |
| `prisma/schema.prisma` | Campo `menuPermissoes Json?` no model `Escritorio` |

---

## Fluxo de Permissões

### Na autenticação (login)

```
Usuário faz login
  → jwt callback (auth.ts)
    → carrega escritorio.menuPermissoes do banco
    → armazena em token.menuPermissoes (JWT cookie)
```

### Em cada request (middleware)

```
Request chega no proxy.ts
  → decodifica JWT do cookie
  → valida tipo (admin | contador | assistente) → senão → /login
  → verifica precisaTrocarSenha → senão → /crm/trocar-senha
  → se path em ROTAS_LIVRES → passa direto
  → se /crm/configuracoes e não-admin → /crm/acesso-negado
  → se não-admin → resolverPermissoes(token.menuPermissoes) → podeAcessarRota()
      → false → /crm/acesso-negado
      → true → passa
```

### Propagação de mudanças (revalidação)

```
Admin salva novas permissões via PATCH /api/configuracoes/menu-permissoes
  → escritorio.menuPermissoes atualizado no banco
  → próxima revalidação de sessão (≤ 5 min, session callback em auth.ts)
    → escritorio.menuPermissoes recarregado
    → token.menuPermissoes atualizado no JWT cookie
  → próxima request → middleware usa permissões atualizadas
```

Delay máximo de propagação: **5 minutos** (mesmo intervalo de revalidação de `ativo` e `precisaTrocarSenha`).

---

## `menu-permissoes.ts` — Referência

### `MENUS_DISPONIVEIS`

Lista canônica com 15 entradas (ordem = ordem da sidebar):

| Grupo | href | Label |
|-------|------|-------|
| Comercial | `/crm/dashboard` | Dashboard |
| Comercial | `/crm/prospeccao` | Prospecção |
| Comercial | `/crm/leads` | Onboarding |
| Comercial | `/crm/clientes` | Clientes |
| Comercial | `/crm/empresas` | Empresas |
| Atendimento | `/crm/atendimentos` | Atendimentos |
| Atendimento | `/crm/chamados` | Chamados |
| Atendimento | `/crm/emails` | E-mails |
| Comunicação | `/crm/comunicados` | Comunicados |
| Financeiro | `/crm/financeiro/dashboard` | Dashboard Fin. |
| Financeiro | `/crm/financeiro/funcionarios` | Funcionários |
| Financeiro | `/crm/financeiro/inadimplentes` | Inadimplentes |
| Financeiro | `/crm/financeiro/reajuste` | Reajuste |
| Inteligência | `/crm/relatorios` | Relatórios IA |
| Configurações | `/crm/configuracoes` | Configurações |

> ⚠️ `/crm/configuracoes` é bloqueado por regra hard — nunca aparece como editável na UI e é filtrado no PATCH.

### `DEFAULT_PERMISSOES`

Usado quando `menuPermissoes` é `null` no banco (nova instalação ou campo não configurado):

**Contador** (14 menus — tudo exceto Configurações):
- Todos os menus de Comercial, Atendimento, Comunicação, Financeiro e Inteligência

**Assistente** (11 menus — ~80%):
- Todos de Comercial, Atendimento, Comunicação
- Financeiro: apenas Inadimplentes (sem Dashboard Fin., Funcionários e Reajuste)
- Inteligência: Relatórios IA

### `resolverPermissoes(stored: unknown): MenuPermissoes`

- Recebe o valor raw do JSON do banco (ou JWT)
- Valida estrutura `{ contador: string[], assistente: string[] }`
- Fallback por campo: se `contador` inválido, usa `DEFAULT_PERMISSOES.contador`
- **Sempre retorna cópia** (spread) — nunca retorna referência ao singleton `DEFAULT_PERMISSOES`

### `podeAcessarRota(tipo, path, permissoes): boolean`

- `admin` → sempre `true`
- Outros → verifica se `path === href || path.startsWith(href + '/')` para algum href na lista do role

---

## API — `GET /api/configuracoes/menu-permissoes`

**Auth:** `tipo === 'admin'`

**Response:**
```json
{
  "menuPermissoes": {
    "contador": ["/crm/dashboard", "/crm/clientes", ...],
    "assistente": ["/crm/dashboard", ...]
  }
}
```
`null` quando não configurado (frontend usa defaults).

---

## API — `PATCH /api/configuracoes/menu-permissoes`

**Auth:** `tipo === 'admin'`

**Body:**
```json
{
  "contador": ["/crm/dashboard", "/crm/clientes"],
  "assistente": ["/crm/dashboard"]
}
```

**Validação (Zod):**
- Cada href deve estar em `MENUS_DISPONIVEIS`
- `/crm/configuracoes` é removido do payload silenciosamente mesmo que enviado (segunda camada de defesa)

**Response:** `{ "ok": true }`

---

## UI — `MenuPermissoesConfig`

Componente client renderizado na página `/crm/configuracoes/usuarios`.

- Tabela com uma linha por menu, 4 colunas: Menu | Admin | Contador | Assistente
- Admin: todos marcados, desabilitados (visual)
- `/crm/configuracoes`: todas as colunas de não-admin desabilitadas com ícone de cadeado
- Checkbox vira botão com `role="checkbox"` + `aria-checked`
- `isDirty`: compara estado atual com `baseline` (estado do último save bem-sucedido)
- Botão "Salvar" desabilitado quando `!isDirty || saving`
- Após save bem-sucedido: `baseline` é atualizado → botão volta a desabilitado
- Toast de sucesso/erro

---

## Página `/crm/acesso-negado`

Dentro do layout CRM (tem sidebar e header). Exibe:
- Ícone de cadeado
- Mensagem: "Você não tem permissão para acessar esta página."
- Botão `Link` → `/crm/dashboard` (sempre acessível via `ROTAS_LIVRES`)

**Quando é exibida:**
1. Rota de Configurações acessada por não-admin
2. Qualquer rota fora das permissões configuradas para o perfil

---

## ROTAS_LIVRES (middleware)

Rotas que bypassam a verificação de permissão de menu (mas ainda exigem autenticação e tipo válido):

```ts
['/crm/acesso-negado', '/crm/trocar-senha', '/crm/dashboard']
```

O dashboard é livre para garantir que sempre haja um destino válido após login, independente das permissões configuradas.

---

## Schema Prisma

```prisma
model Escritorio {
  // ...
  menuPermissoes Json?  // { contador: string[], assistente: string[] }
  // ...
}
```

**Migration:** `20260406234758_add_menu_permissoes`

O campo é `null` por padrão. `null` = sistema usa `DEFAULT_PERMISSOES` hardcoded.

---

## Manutenção

### Adicionar novo menu ao CRM

1. Criar a página em `src/app/(crm)/crm/<nova-rota>/page.tsx`
2. Adicionar entrada em `NAV_GROUPS` em `crm-sidebar.tsx`
3. Adicionar entrada em `MENUS_DISPONIVEIS` em `menu-permissoes.ts` (mesmo `href`, mesmo `grupo`)
4. Decidir se entra no `DEFAULT_PERMISSOES` de contador e/ou assistente
5. O middleware e a sidebar passam a respeitar a nova entrada automaticamente

### Remover menu do CRM

1. Remover de `NAV_GROUPS`
2. Remover de `MENUS_DISPONIVEIS`
3. Remover de `DEFAULT_PERMISSOES`
4. Os registros antigos no banco com o href removido são ignorados silenciosamente pelo `podeAcessarRota` (a rota simplesmente para de existir)

---

## Campos do Modelo `Usuario`

O `select` da query de listagem (`/crm/configuracoes/usuarios/page.tsx`) deve incluir **todos os campos usados no `EditarUsuarioDrawer`**:

```ts
select: { id, nome, email, tipo, ativo, avatar, whatsapp, criadoEm }
```

> ⚠️ **Atenção:** Este é o único módulo que usa `select` explícito na query de listagem (os demais usam `include`). Ao adicionar campo no form de edição, incluir também no `select` da page e nos tipos `UsuarioRow` e `Usuario` (em `usuario-actions-menu.tsx`).

**Bug histórico (v3.10.x → corrigido 2026-04-17):** `whatsapp` não estava no `select` → campo aparecia vazio ao reabrir o drawer de edição, embora o PATCH salvasse corretamente no banco.

---

## Decisões de Design

| Decisão | Motivo |
|---------|--------|
| Permissões por role (não por usuário) | Mais simples, suficiente para o caso de uso, reduz combinatória |
| Armazenar no `Escritorio` (JSON) | Padrão já usado para `toolsDesabilitadas`; sem modelo extra |
| `null` = defaults hardcoded | Retrocompatível — instalações antigas sem o campo não quebram |
| JWT carrega `menuPermissoes` | Middleware Edge não acessa DB; JWT é o canal de transporte |
| Revalidação 5 min | Mesmo intervalo de `ativo`/`precisaTrocarSenha`; custo/benefício aceitável |
| Admin sempre full access (hard) | Não faz sentido admin travar a si mesmo fora do sistema |
| Dashboard em `ROTAS_LIVRES` | Garante destino válido após login independente de config |
