'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { cn, getInitials } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import type { SessionUser } from '@/types'

type NavItem = { href: string; icon: string; label: string }
type NavGroup = { label?: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Comercial',
    items: [
      { href: '/crm/dashboard',  icon: 'dashboard',     label: 'Dashboard' },
      { href: '/crm/prospeccao', icon: 'contact_phone', label: 'Prospecção' },
      { href: '/crm/leads',      icon: 'rocket_launch', label: 'Onboarding' },
      { href: '/crm/clientes',   icon: 'group',         label: 'Clientes' },
      { href: '/crm/empresas',   icon: 'business',      label: 'Empresas' },
    ],
  },
  {
    label: 'Atendimento',
    items: [
      { href: '/crm/atendimentos',   icon: 'support_agent', label: 'Atendimentos' },
      { href: '/crm/ordens-servico', icon: 'assignment',    label: 'Chamados' },
      { href: '/crm/emails',         icon: 'mail',          label: 'E-mails' },
      { href: '/crm/tarefas',        icon: 'check_circle',  label: 'Tarefas' },
    ],
  },
  {
    label: 'Comunicação',
    items: [
      { href: '/crm/comunicados', icon: 'campaign', label: 'Comunicados' },
    ],
  },
  {
    label: 'Inteligência',
    items: [
      { href: '/crm/relatorios', icon: 'psychology', label: 'Relatórios IA' },
    ],
  },
  {
    label: 'Configurações',
    items: [
      { href: '/crm/configuracoes', icon: 'settings', label: 'Configurações' },
    ],
  },
]

function resolveTitle(pathname: string): string {
  if (pathname === '/crm/dashboard') return 'Painel de Controle'
  if (pathname === '/crm/prospeccao') return 'Prospecção'
  if (pathname === '/crm/leads') return 'Onboarding'
  if (/^\/crm\/leads\/.+/.test(pathname)) return 'Detalhes do Lead'
  if (pathname === '/crm/clientes') return 'Clientes'
  if (/^\/crm\/clientes\/.+/.test(pathname)) return 'Detalhes do Cliente'
  if (pathname === '/crm/empresas') return 'Empresas'
  if (/^\/crm\/empresas\/.+/.test(pathname)) return 'Detalhes da Empresa'
  if (pathname === '/crm/atendimentos') return 'Atendimentos'
  if (pathname === '/crm/ordens-servico') return 'Chamados'
  if (pathname === '/crm/emails') return 'E-mails'
  if (pathname === '/crm/tarefas') return 'Tarefas'
  if (pathname === '/crm/comunicados') return 'Comunicados'
  if (pathname === '/crm/relatorios') return 'Relatórios IA'
  if (pathname.startsWith('/crm/configuracoes')) return 'Configurações'
  return 'Avos'
}

type Props = {
  user: SessionUser
  pendingEscalacoes?: number
  pendingEmails?: number
  pendingChamados?: number
}

function useAiHealthAlert() {
  const [anyDown, setAnyDown] = useState(false)

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/ai/health')
        if (!res.ok) return
        const data = await res.json() as Record<string, { ok: boolean; checkedAt: number }>
        const down = Object.values(data).some(s => s.checkedAt > 0 && !s.ok)
        setAnyDown(down)
      } catch { /* silencia */ }
    }
    check()
    const id = setInterval(check, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  return anyDown
}

type Notificacao = {
  id: string
  tipo: string
  titulo: string
  descricao?: string
  href: string
  criadaEm: string
  podeDescartar: boolean
}

function useNotificacoes() {
  const [items, setItems] = useState<Notificacao[]>([])

  const load = async () => {
    try {
      const res = await fetch('/api/notificacoes')
      if (!res.ok) return
      setItems(await res.json() as Notificacao[])
    } catch { /* silencia */ }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [])

  const descartar = async (id: string) => {
    setItems(prev => prev.filter(n => n.id !== id))
    try { await fetch(`/api/notificacoes/${id}`, { method: 'PATCH' }) } catch { /* silencia */ }
  }

  const descartarTudo = async () => {
    setItems(prev => prev.filter(n => !n.podeDescartar))
    try { await fetch('/api/notificacoes', { method: 'DELETE' }) } catch { /* silencia */ }
  }

  return { items, descartar, descartarTudo }
}

export function CrmHeader({ user, pendingEscalacoes = 0, pendingEmails = 0, pendingChamados = 0 }: Props) {
  const pathname = usePathname()
  const title = resolveTitle(pathname)
  const [mobileOpen, setMobileOpen] = useState(false)
  const aiDown = useAiHealthAlert()
  const { items: notificacoes, descartar, descartarTudo } = useNotificacoes()
  const [notifOpen, setNotifOpen] = useState(false)

  function fecharNotif() {
    setNotifOpen(false)
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-outline-variant/15 bg-card/80 px-4 md:px-8 backdrop-blur-md">
      {/* Mobile: hambúrguer + título */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex md:hidden h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant/70 hover:bg-surface-container hover:text-on-surface transition-colors"
          aria-label="Abrir menu"
        >
          <span className="material-symbols-outlined text-[22px]">menu</span>
        </button>
        <h2 className="font-headline text-lg font-semibold tracking-tight text-on-surface">{title}</h2>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Search — oculto no mobile */}
        <div className="relative mr-2 hidden md:block">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/60">
            search
          </span>
          <input
            className="h-9 w-64 rounded-[10px] border border-outline-variant/20 bg-surface-container-low/50 pl-9 pr-4 text-[13px] text-on-surface shadow-sm placeholder:text-on-surface-variant/60 transition-all hover:bg-surface-container-low focus:w-80 focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10"
            placeholder="Pressione ⌘K para buscar..."
            type="text"
          />
        </div>

        <div className="flex items-center gap-1">
          {aiDown && (
            <Link
              href="/crm/configuracoes/ia"
              title="Uma ou mais IAs estão fora do ar — clique para verificar"
              className="hidden md:flex h-9 items-center gap-1.5 rounded-lg bg-error/10 px-2.5 text-error hover:bg-error/20 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">warning</span>
              <span className="text-[12px] font-semibold">IA offline</span>
            </Link>
          )}
          <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
            <DropdownMenuTrigger className="hidden md:flex relative h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant/70 transition-colors hover:bg-surface-container hover:text-on-surface">
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: notifOpen ? "'FILL' 1" : "'FILL' 0" }}>notifications</span>
              {notificacoes.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[9px] font-bold text-white">
                  {notificacoes.length > 99 ? '99+' : notificacoes.length}
                </span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 rounded-xl p-0 shadow-lg border-outline-variant/15 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
                <span className="text-[13px] font-semibold text-on-surface">Notificações</span>
                <div className="flex items-center gap-2">
                  {notificacoes.some(n => n.podeDescartar) && (
                    <button
                      onClick={descartarTudo}
                      className="text-[11px] text-on-surface-variant/50 hover:text-on-surface transition-colors"
                    >
                      Limpar tudo
                    </button>
                  )}
                  {notificacoes.length > 0 && (
                    <span className="rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-bold text-error">
                      {notificacoes.length} pendente{notificacoes.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Lista */}
              {notificacoes.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <span className="material-symbols-outlined text-[32px] text-on-surface-variant/25">notifications</span>
                  <p className="text-[12px] text-on-surface-variant/50">Nenhuma notificação</p>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto divide-y divide-outline-variant/10">
                  {notificacoes.map(n => (
                    <Link
                      key={n.id}
                      href={n.href}
                      className="group flex items-start gap-2 px-4 py-3 hover:bg-surface-container/50 cursor-pointer transition-colors"
                      onClick={() => {
                        descartar(n.id)
                        fecharNotif()
                      }}
                    >
                      {/* Ícone */}
                      <span
                        className="mt-0.5 shrink-0 material-symbols-outlined text-[16px] text-error"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        {n.tipo === 'escalacao'      ? 'escalator_warning'
                        : n.tipo === 'ia_offline'    ? 'cloud_off'
                        : n.tipo === 'agente_falhou' ? 'smart_toy'
                        : 'warning'}
                      </span>

                      {/* Conteúdo */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-on-surface truncate">{n.titulo}</p>
                        {n.descricao && (
                          <p className="line-clamp-1 text-[11px] text-on-surface-variant/60 mt-0.5">{n.descricao}</p>
                        )}
                        {!n.podeDescartar && (
                          <p className="text-[10px] text-primary/60 mt-0.5 font-medium">Clique para atender</p>
                        )}
                      </div>

                      {/* Hora + ações */}
                      <div className="flex shrink-0 flex-col items-end gap-1.5 ml-1">
                        <span className="text-[10px] text-on-surface-variant/40">
                          {new Date(n.criadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {n.podeDescartar ? (
                          <button
                            onClick={e => { e.preventDefault(); e.stopPropagation(); descartar(n.id) }}
                            className="opacity-0 group-hover:opacity-100 flex h-5 w-5 items-center justify-center rounded-full text-on-surface-variant/40 hover:bg-surface-container hover:text-on-surface transition-all"
                            title="Descartar"
                          >
                            <span className="material-symbols-outlined text-[13px]">close</span>
                          </button>
                        ) : (
                          <span className="material-symbols-outlined text-[13px] text-primary/50">arrow_forward</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

            </DropdownMenuContent>
          </DropdownMenu>
          <button className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant/70 transition-colors hover:bg-surface-container hover:text-on-surface">
            <span className="material-symbols-outlined text-[20px]">help_outline</span>
          </button>

          <div className="mx-2 hidden md:block h-6 w-px bg-outline-variant/20" />

          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ring-offset-2 ring-offset-card transition-all">
              <Avatar className="h-8 w-8 cursor-pointer ring-1 ring-outline-variant/20">
                <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                  {getInitials(user.name ?? 'U')}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5 shadow-lg border-outline-variant/15">
              <div className="px-2.5 py-2">
                <div className="flex flex-col space-y-1">
                  <p className="text-[14px] font-semibold text-on-surface">{user.name}</p>
                  <p className="text-[12px] font-medium text-on-surface-variant/80">{user.email}</p>
                </div>
              </div>
              <DropdownMenuSeparator className="bg-outline-variant/10 -mx-1.5" />
              <DropdownMenuItem
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="cursor-pointer rounded-md text-[13px] font-medium text-error focus:bg-error/10 focus:text-error px-2.5"
              >
                <span className="material-symbols-outlined mr-2 text-[18px]">logout</span>
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile nav drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-72 p-0 bg-[#0A0A0B] border-r border-white/5">
          {/* Logo */}
          <div className="flex h-16 items-center gap-3 px-6">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_14px_rgba(0,85,255,0.35)]">
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                calculate
              </span>
            </div>
            <div>
              <h1 className="text-[15px] font-semibold tracking-tight text-white mb-0.5">AVOS</h1>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 leading-none">Workspace</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-4 py-4">
            {NAV_GROUPS.filter(group =>
              user.tipo === 'admin' || group.label !== 'Configurações'
            ).map((group, gi) => (
              <div key={gi} className={gi > 0 ? 'mt-5' : ''}>
                {group.label && (
                  <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                    {group.label}
                  </div>
                )}
                <div className="space-y-0.5">
                  {group.items.map(({ href, icon, label }: NavItem) => {
                    const active = pathname === href || pathname.startsWith(href + '/')
                    const badgeCount =
                      href === '/crm/atendimentos' ? pendingEscalacoes :
                      href === '/crm/emails'        ? pendingEmails :
                      href === '/crm/ordens-servico'? pendingChamados : 0
                    const showBadge = badgeCount > 0
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] font-medium transition-all duration-200',
                          active
                            ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/10'
                            : 'text-white/60 hover:bg-white/5 hover:text-white',
                        )}
                      >
                        <span
                          className="material-symbols-outlined text-[20px]"
                          style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                        >
                          {icon}
                        </span>
                        <span>{label}</span>
                        {showBadge && !active && (
                          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[10px] font-bold text-white">
                            {badgeCount > 9 ? '9+' : badgeCount}
                          </span>
                        )}
                        {active && (
                          <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(0,85,255,0.8)]" />
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* User */}
          <div className="border-t border-white/5 p-4 m-2 rounded-xl bg-white/5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-700 text-[11px] font-bold text-white shadow-sm ring-1 ring-white/10">
                {getInitials(user.name ?? 'U')}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-white">{user.name}</p>
                <button
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="cursor-pointer text-[11px] font-medium text-white/50 transition-colors hover:text-error"
                >
                  Sair do sistema
                </button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
