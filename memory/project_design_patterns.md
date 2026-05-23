---
name: CRM Design Patterns
description: Padrões visuais e de código do CRM ContabAI — seguir em TODAS as novas telas/componentes
type: project
---

## Stack de design
- **Tokens**: Material Design 3 via `globals.css` (`@theme inline`) — ÚNICA fonte de verdade
- **CSS**: Tailwind v4, sem classes customizadas fora de globals.css
- **Ícones**: `material-symbols-outlined` (Google Fonts), weight 400, FILL controlado via `fontVariationSettings`
- **Fonte**: Plus Jakarta Sans via `--font-plus-jakarta` → `font-sans` / `font-headline`
- **Badge maps**: importar sempre de `@/types` (CANAL_COLORS, STATUS_LEAD_COLORS, PLANO_COLORS, STATUS_CLIENTE_COLORS)

---

## Paleta atual (globals.css — estado após modernização do usuário)

| Token | Valor | Uso |
|-------|-------|-----|
| `--primary` | `#6366f1` (indigo) | Ação primária, links, botões |
| `--color-surface` | `#f8fafc` (slate-50) | Fundo da página |
| `--color-surface-container-lowest` | `#ffffff` | Fundo de card/tabela |
| `--color-surface-container-low` | `#f8fafc` | Hover de linha |
| `--color-surface-container` | `#f1f5f9` (slate-100) | Headers de tabela, pill bg |
| `--color-surface-container-high` | `#e2e8f0` (slate-200) | Separadores |
| `--card` | `#ffffff` | Background de card (shadcn alias) |
| `--color-outline-variant` | `#e2e8f0` (slate-200) | Bordas |
| `--color-on-surface` | `#0f172a` (slate-900) | Texto principal |
| `--color-on-surface-variant` | `#64748b` (slate-500) | Texto secundário |
| `--color-tertiary` | `#14b8a6` (teal) | Acento cyan (Ag. assinatura, Startup) |
| `--color-green-status` | `#10b981` | Ativo, assinado, concluído |
| `--color-orange-status` | `#f59e0b` | Warning, hoje, ag. assinatura |
| `--color-error` | `#ef4444` | Urgente, vencido, erro |
| Sidebar bg | `#0A0A0B` (near-black) | `bg-[#0A0A0B]` diretamente |

**Importante**: palette é **slate-neutral** (não blue-tinted). Primary é **indigo `#6366f1`**, não azul.

---

## Layout principal
```tsx
// (crm)/layout.tsx
<div className="flex h-screen overflow-hidden bg-surface-container-low">
  <CrmSidebar />  // w-64, bg-[#0A0A0B]
  <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
    <CrmHeader />  // h-16, bg-card/80 backdrop-blur
    <main className="custom-scrollbar flex-1 overflow-y-auto px-8 py-6">
```

## Sidebar
```tsx
// bg-[#0A0A0B] border-r border-white/5
// Logo: bg-primary text-primary-foreground shadow-[0_0_15px_rgba(99,102,241,0.3)]
// Nav item ativo: bg-white/10 text-white ring-1 ring-white/10
//   + dot: ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(99,102,241,0.8)]
// Nav item inativo: text-white/60 hover:bg-white/5 hover:text-white
// User section: border-t border-white/5 p-4 m-2 rounded-xl bg-white/5
// Avatar: bg-gradient-to-br from-primary to-indigo-700
```

## Header
```tsx
// h-16 border-b border-outline-variant/15 bg-card/80 backdrop-blur-md
// Título: font-headline text-lg font-semibold tracking-tight text-on-surface
// Search: h-9 w-64 rounded-[10px] border border-outline-variant/20 bg-surface-container-low/50
//   focus: focus:w-80 focus:border-primary/50 focus:bg-card focus:ring-[3px] focus:ring-primary/10
// Icon buttons: h-9 w-9 rounded-lg hover:bg-surface-container
// Avatar: h-8 w-8 bg-primary/10 text-xs font-bold text-primary
```

---

## Estrutura de página padrão
```tsx
<div className="space-y-8">   {/* ou space-y-6 */}
  {/* Header */}
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-on-surface">Título</h1>
      <p className="mt-1 text-sm text-on-surface-variant">Subtítulo</p>
    </div>
    <button className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors">
      <span className="material-symbols-outlined text-[18px]">add</span>
      Ação
    </button>
  </div>
  {/* Content */}
</div>
```

---

## Cards
```tsx
// Card padrão (lista, kanban, detalhe)
"rounded-[14px] border border-outline-variant/15 bg-card shadow-sm transition-all duration-200 hover:shadow-md"

// Card com header + body separator
// Header: "mb-6 flex items-center gap-3"  (+ ícone + h2)
// Sem background no header — apenas espaçamento

// KPI card (dashboard)
"rounded-[14px] border border-outline-variant/15 bg-card p-5 shadow-sm flex flex-col justify-between"
```

---

## Tabelas
```tsx
// Wrapper
"overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card shadow-sm"

// thead row (SEM background — só border-b)
"border-b border-outline-variant/15"

// th
"px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant"

// tbody
"divide-y divide-outline-variant/15"

// tr hover
"group transition-colors hover:bg-surface-container-low/50"

// td
"px-6 py-3.5"
```

---

## Badges / Pills
```tsx
// Padrão: bg 10% + texto full color
"rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-{color}/10 text-{color}"

// Com borda extra
"rounded-md border border-{color}/20 bg-{color}/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-{color}"

// Neutro (status sem cor)
"bg-surface-container text-on-surface-variant"

// Status semânticos
"bg-green-status/10 text-green-status"    // ativo, assinado
"bg-error/10 text-error"                 // urgente, vencido
"bg-orange-status/10 text-orange-status" // warning, hoje
"bg-primary/10 text-primary"             // principal
"bg-tertiary/10 text-tertiary"           // secundário/startup
```

---

## Tipografia

| Uso | Classes |
|-----|---------|
| Título de página | `text-2xl font-semibold tracking-tight text-on-surface` |
| Título hero (detalhe) | `text-4xl font-light tracking-tight text-on-surface` |
| Ref/breadcrumb | `text-[11px] font-bold uppercase tracking-wider text-on-surface-variant` |
| Título de seção | `font-headline text-base font-semibold text-on-surface` (ou `text-lg`) |
| Label de campo (uppercase) | `text-[10px] font-bold uppercase tracking-wider text-on-surface-variant` ou `/80` |
| Valor de campo | `text-[14px] font-medium text-on-surface` |
| KPI número | `text-3xl font-semibold tracking-tight text-on-surface` |
| Cabeçalho de coluna | `text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant` |
| Texto secundário | `text-[13px] text-on-surface-variant/80` |
| Texto mono | `font-mono text-xs` |

---

## Ícones
```tsx
// Tamanhos
text-[20px]  // cards, headers
text-[18px]  // botões, nav
text-[16px]  // ações inline
text-[13px]  // mini (dentro de badges)

// Outlined (padrão)
<span className="material-symbols-outlined text-[18px]">icon_name</span>

// Filled (ativo/importante)
<span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>icon_name</span>

// Com background circular/quadrado
<div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary/10">
  <span className="material-symbols-outlined text-[20px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>icon</span>
</div>
```

---

## Botões
```tsx
// Primário
"flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"

// Secundário (borda)
"rounded-xl border border-outline-variant/30 bg-card px-5 py-2.5 text-sm font-semibold text-on-surface shadow-sm hover:bg-surface-container-low transition-colors"

// Icon button (pequeno circular/square)
"flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant/70 hover:bg-surface-container hover:text-on-surface transition-colors"

// Toggle/filtro ativo
"rounded-full bg-card px-5 py-2 text-[13px] font-semibold text-primary shadow-sm ring-1 ring-outline-variant/10"
// Toggle/filtro inativo
"rounded-full px-5 py-2 text-[13px] font-medium text-on-surface-variant hover:text-on-surface hover:bg-outline-variant/5 transition-colors"
```

---

## Empty States
```tsx
// Com ícone (em tabs, seções)
<div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant/30 py-16 text-center gap-2">
  <span className="material-symbols-outlined text-[32px] text-on-surface-variant/30">icon</span>
  <p className="text-[13px] text-on-surface-variant">Mensagem</p>
</div>

// Simples (tabela/lista vazia)
<div className="flex h-32 flex-col items-center justify-center">
  <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">Nenhum item ainda</span>
</div>

// Kanban column
<div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-outline-variant/30 bg-surface-container-low/30">
  <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">Vazio</span>
</div>
```

---

## Tabs (pill style — telas de detalhe)
```tsx
<TabsList className="inline-flex h-12 items-center gap-1 rounded-full bg-surface-container/80 p-1 ring-1 ring-inset ring-outline-variant/20">
  <TabsTrigger
    value={value}
    className="rounded-full px-4 text-sm font-medium data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-outline-variant/10 hover:text-on-surface"
  />
</TabsList>
```

---

## Timeline / Histórico
```tsx
<div className="flex gap-4">
  <div className="flex flex-col items-center">
    {/* Dot: primeiro = primary com ring, resto = outline */}
    <div className="mt-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary/10" />
    <div className="w-px flex-1 bg-outline-variant/20 my-1" />  {/* connector */}
  </div>
  <div className="pb-6 min-w-0 flex-1">
    <div className="flex items-start justify-between gap-4">
      <p className="text-[14px] font-semibold text-on-surface">Título</p>
      <span className="shrink-0 text-[11px] font-medium text-on-surface-variant/70">data</span>
    </div>
    <p className="mt-1 text-sm leading-relaxed text-on-surface-variant line-clamp-2">Conteúdo</p>
  </div>
</div>
```

---

## InfoRow (campo label + valor em grid 2 colunas)
```tsx
function InfoRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/80">{label}</p>
      <p className={`text-[14px] ${bold ? 'font-semibold text-primary' : 'font-medium text-on-surface'}`}>{value}</p>
    </div>
  )
}
// Usado em grid: <div className="grid grid-cols-2 gap-x-4 gap-y-6">
```

---

## Kanban board (leads)
```tsx
// Column header
<div className="flex items-center justify-between pb-1">
  <div className="flex items-center gap-2">
    <div className="h-1.5 w-1.5 rounded-full bg-{color}" />
    <h3 className="text-[13px] font-semibold tracking-wide text-on-surface-variant uppercase">{label}</h3>
  </div>
  <span className="rounded-full bg-outline-variant/15 px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">{count}</span>
</div>

// Card de lead
"rounded-[14px] border border-outline-variant/15 bg-card p-4 shadow-sm flex flex-col gap-3
 hover:shadow-md hover:border-outline-variant/30 transition-all"
```

---

## Mobile — Padrões estabelecidos

### Kanban → Tabs no mobile
Kanban não funciona em telas pequenas. Padrão adotado: Tabs no mobile + Kanban no desktop.
```tsx
{/* Mobile: Tabs */}
<div className="block md:hidden">
  <Tabs defaultValue="iniciado">
    <div className="mb-6 overflow-x-auto custom-scrollbar pb-2">
      <TabsList className="inline-flex h-12 w-max min-w-full items-center justify-start gap-1 rounded-full bg-surface-container/80 p-1 ...">
        {/* tabs */}
      </TabsList>
    </div>
    {/* TabsContent com lista vertical de cards */}
  </Tabs>
</div>

{/* Desktop: Kanban */}
<div className="hidden md:block overflow-x-auto pb-4 custom-scrollbar">
  <div className="flex gap-5" style={{ minWidth: 'max-content' }}>
    {/* colunas */}
  </div>
</div>
```

### Tabs com scroll horizontal (detalhe de entidade)
Quando há muitas tabs em mobile, permitir scroll horizontal:
```tsx
<div className="mb-6 overflow-x-auto custom-scrollbar pb-2">
  <TabsList className="inline-flex h-12 min-w-max items-center ...">
    {/* tabs */}
  </TabsList>
</div>
```
Chave: `overflow-x-auto` no wrapper + `min-w-max` no TabsList.

---

## Landing Page (Portal público)

A landing page **não usa** `Card`, `Badge` ou `buttonVariants` do Shadcn — tudo é Tailwind puro com os tokens MD3.

### Nav
```tsx
<nav className="sticky top-0 z-50 border-b border-outline-variant/20 bg-surface/80 backdrop-blur-xl">
  {/* Logo com neon shadow (igual sidebar) */}
  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_15px_rgba(99,102,241,0.4)]">
    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>calculate</span>
  </div>
  {/* CTAs mobile-first */}
  // Entrar: text-sm font-semibold text-on-surface-variant hover:text-primary
  // Começar: rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white
```

### Hero
```tsx
{/* Background glow */}
<div className="absolute top-0 left-1/2 -z-10 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px] pointer-events-none" />

{/* Badge animado */}
<span className="inline-flex mb-6 items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary">
  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
  Texto
</span>

{/* Headline com gradient */}
<h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-7xl font-headline leading-tight">
  Título normal{' '}
  <span className="bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
    destaque
  </span>
</h1>

{/* CTAs mobile-first (w-full sm:w-auto) */}
<Link href="/onboarding" className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 text-sm font-bold text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:bg-primary/90 hover:scale-[1.02]">
  CTA principal <ArrowRight className="h-4 w-4" />
</Link>
<Link href="#planos" className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full border border-outline-variant/30 bg-surface-container-lowest px-8 py-4 text-sm font-bold text-on-surface hover:bg-surface-container-low">
  CTA secundário
</Link>
```

### Feature cards (landing)
```tsx
<div className="group rounded-[20px] border border-outline-variant/15 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-primary/20 flex flex-col items-start">
  {/* Ícone: muda de bg-primary/10 para bg-primary no hover */}
  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary">
    <Icon className="h-6 w-6 text-primary transition-colors group-hover:text-white" />
  </div>
  <h3 className="mb-2 font-headline text-lg font-semibold text-on-surface">{title}</h3>
  <p className="text-sm leading-relaxed text-on-surface-variant/90">{desc}</p>
</div>
```

### Pricing cards (landing)
```tsx
<div className={cn(
  'relative flex flex-col overflow-hidden rounded-[24px] border p-6 md:p-8',
  destaque
    ? 'border-primary/30 bg-white ring-2 ring-primary/20 shadow-[0_8px_30px_rgba(99,102,241,0.12)] lg:scale-[1.03] z-10'
    : 'border-outline-variant/20 bg-surface-container-lowest shadow-sm hover:shadow-md'
)}>
  {/* Ribbon "Mais popular" */}
  {destaque && (
    <div className="absolute top-0 right-0 left-0 bg-primary py-1.5 text-center text-[11px] font-bold uppercase tracking-widest text-primary-foreground">
      Mais popular
    </div>
  )}
  {/* Preço */}
  <div className="mt-6 flex items-baseline gap-1">
    <span className="text-sm font-semibold text-on-surface-variant">R$</span>
    <span className="font-headline text-4xl font-extrabold tracking-tight text-primary">{valor}</span>
    <span className="text-sm font-medium text-on-surface-variant/70">/mês</span>
  </div>
```

### CTA dark section (landing)
```tsx
<section className="mx-auto max-w-5xl px-4 py-12 md:py-24">
  <div className="relative overflow-hidden rounded-[32px] bg-[#0A0A0B] px-6 py-12 text-center md:px-12 md:py-20 shadow-2xl">
    {/* Glows decorativos */}
    <div className="absolute -top-32 -left-32 h-64 w-64 rounded-full bg-primary/30 blur-[80px]" />
    <div className="absolute -bottom-32 -right-32 h-64 w-64 rounded-full bg-tertiary/20 blur-[80px]" />

    <h2 className="relative z-10 font-headline text-3xl font-bold text-white md:text-5xl">...</h2>
    <p className="relative z-10 text-white/70">...</p>
    <Link href="/onboarding" className="relative z-10 inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-bold text-[#0A0A0B] hover:bg-surface-container-low hover:scale-[1.02]">
      CTA <ArrowRight className="h-4 w-4 text-primary" />
    </Link>
  </div>
</section>
```

---

**Why:** Padrão estabelecido após refatoração completa feita pelo próprio usuário. Palette slate-neutral com primary indigo. Sidebar near-black. Cards limpos sem headers coloridos.
**How to apply:** Antes de criar qualquer nova tela/componente, consultar este documento. Primary = `#6366f1` (indigo). Borda de card: `border-outline-variant/15`. Sem headers coloridos em cards. Table thead: apenas `border-b`, sem `bg-surface-container`. Landing page não usa componentes Shadcn genéricos (Card/Badge/buttonVariants) — Tailwind puro com tokens MD3.

---

## Documento fonte de referência
`/Users/alissonsaraiva/.gemini/antigravity/brain/b017f857-7268-4201-914b-898296cc9cfa/frontend_design_guidelines.md.resolved`
Consultar quando precisar de contexto adicional sobre decisões de design.
