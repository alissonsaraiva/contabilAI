---
name: Sistema de Notificações do CRM
description: Arquitetura do sino de notificações no header do CRM — extensível para qualquer feature
type: project
---

## Arquitetura

**Endpoint:** `GET /api/notificacoes`
- Agrega notificações de múltiplas fontes em paralelo
- Retorna array de `Notificacao[]` com estrutura unificada
- Auth-gated: só retorna dados para admin/contador

**Tipo unificado:**
```ts
type Notificacao = {
  id: string
  tipo: 'escalacao' | 'ia_offline' | 'entrega_falhou' // extensível
  titulo: string
  descricao?: string
  href: string   // destino de navegação ao clicar
  criadaEm: string // ISO
}
```

**Hook:** `useNotificacoes()` em `crm-header.tsx`
- Polling a cada 30s via `/api/notificacoes`
- Retorna `Notificacao[]`

**UI:** `DropdownMenu` no bell icon do `CrmHeader`
- Badge vermelho com contagem
- Dropdown com lista de notificações clicáveis
- Cada item navega para `n.href` (conversa, configuração, etc.)
- "Ver todos os atendimentos →" no rodapé

## Fontes atuais
- **escalacao** (status: pendente) → link para `/crm/atendimentos/conversa/[conversaIAId]`

## Como adicionar nova fonte
1. Em `/api/notificacoes/route.ts`, adicionar query em paralelo
2. Mapear para o tipo `Notificacao` com `tipo` adequado
3. Definir `href` correto para o destino da notificação
4. Adicionar ícone para o novo `tipo` no switch do header

**Why:** O sino linkava direto para /crm/atendimentos sem mostrar o quê estava pendente. O dropdown permite ao operador saber o contexto antes de navegar.

**How to apply:** Toda nova feature que gere alertas operacionais deve ser adicionada ao endpoint `/api/notificacoes`, não criar um sino/badge separado.
