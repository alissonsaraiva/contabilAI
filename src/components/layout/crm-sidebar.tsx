'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { cn, getInitials } from '@/lib/utils'
import { AvosIcon } from '@/components/avos-logo'
import { useBadges } from '@/hooks/use-badges'
import type { SessionUser } from '@/types'
import { resolverPermissoes, podeAcessarRota } from '@/lib/menu-permissoes'

type NavItem = {
  href: string
  icon: string   // emoji
  label: string
  badge?: boolean       // usa pendingEscalacoes (item Atendimentos)
  badgeCount?: number   // contagem explícita para o item (ex: emails)
}

type NavGroup = {
  label?: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Comercial',
    items: [
      { href: '/crm/dashboard',  icon: '📊', label: 'Dashboard' },
      { href: '/crm/prospeccao', icon: '📡', label: 'Prospecção' },
      { href: '/crm/leads',      icon: '🚀', label: 'Onboarding' },
      { href: '/crm/clientes',   icon: '👥', label: 'Clientes' },
      { href: '/crm/empresas',   icon: '🏢', label: 'Empresas' },
    ],
  },
  {
    label: 'Atendimento',
    items: [
      { href: '/crm/atendimentos',   icon: '💬', label: 'Atendimentos', badge: true },
      { href: '/crm/chamados', icon: '📋', label: 'Chamados' },
      { href: '/crm/emails',         icon: '📧', label: 'E-mails' },
    ],
  },
  {
    label: 'Comunicação',
    items: [
      { href: '/crm/comunicados', icon: '📢', label: 'Comunicados' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { href: '/crm/financeiro/inadimplentes',  icon: '🔴', label: 'Inadimplentes' },
      { href: '/crm/financeiro/reajuste',        icon: '📈', label: 'Reajuste' },
    ],
  },
  {
    label: 'Inteligência',
    items: [
      { href: '/crm/relatorios', icon: '🧠', label: 'Relatórios IA' },
    ],
  },
  {
    label: 'Configurações',
    items: [
      { href: '/crm/configuracoes', icon: '⚙️', label: 'Configurações' },
    ],
  },
]

type Props = {
  user: SessionUser
  pendingEscalacoes?: number
  pendingEmails?: number
  pendingChamados?: number
  nomeEscritorio?: string
  menuPermissoes?: unknown
}

export function CrmSidebar({ user, pendingEscalacoes = 0, pendingEmails = 0, pendingChamados = 0, nomeEscritorio = 'Avos', menuPermissoes: menuPermissoesRaw }: Props) {
  const pathname = usePathname()
  const badges   = useBadges({ escalacoes: pendingEscalacoes, emails: pendingEmails, chamados: pendingChamados })
  const permissoes = resolverPermissoes(menuPermissoesRaw)

  function getBadgeCount(item: NavItem): number {
    if (item.badge)       return badges.escalacoes
    if (item.badgeCount !== undefined) return item.badgeCount
    // E-mails: detecta pelo href
    if (item.href === '/crm/emails')         return badges.emails
    if (item.href === '/crm/chamados') return badges.chamados
    return 0
  }

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-[#0A0A0B] border-r border-white/5">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-6 mt-2">
        <AvosIcon size={32} className="shrink-0 rounded-lg shadow-[0_0_14px_rgba(12,34,64,0.4)]" />
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-white mb-0.5">{nomeEscritorio}</h1>
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 leading-none">Workspace</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-4 py-6 mt-2">
        {NAV_GROUPS.map(group => ({
          ...group,
          items: group.items.filter(item =>
            podeAcessarRota(user.tipo, item.href, permissoes)
          ),
        })).filter(group => group.items.length > 0).map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-5' : ''}>
            {group.label && (
              <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item: NavItem) => {
                const { href, icon, label } = item
                const active     = pathname === href || pathname.startsWith(href + '/')
                const count      = getBadgeCount(item)
                const showBadge  = count > 0
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-all duration-200',
                      active
                        ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/10'
                        : 'text-white/60 hover:bg-white/5 hover:text-white',
                    )}
                  >
                    <span className={cn('text-[18px] leading-none transition-all', active ? 'opacity-100' : 'opacity-60')}>
                      {icon}
                    </span>
                    <span>{label}</span>
                    {showBadge && !active && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[10px] font-bold text-white">
                        {count > 9 ? '9+' : count}
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
    </aside>
  )
}
