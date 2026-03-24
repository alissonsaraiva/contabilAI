'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { cn, getInitials } from '@/lib/utils'
import type { SessionUser } from '@/types'

const NAV_ITEMS = [
  { href: '/crm/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { href: '/crm/leads', icon: 'person_search', label: 'Leads' },
  { href: '/crm/clientes', icon: 'group', label: 'Clientes' },
  { href: '/crm/tarefas', icon: 'check_circle', label: 'Tarefas' },
  { href: '/crm/configuracoes', icon: 'settings', label: 'Configurações' },
]

type Props = { user: SessionUser }

export function CrmSidebar({ user }: Props) {
  const pathname = usePathname()

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-[#0A0A0B] border-r border-white/5">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-6 mt-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_15px_rgba(99,102,241,0.3)]">
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            calculate
          </span>
        </div>
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-white mb-0.5">ContabAI</h1>
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 leading-none">Workspace</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-4 py-6 mt-2">
        <div className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-widest text-white/30">Menu Principal</div>
        {NAV_ITEMS.map(({ href, icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
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
              <span
                className="material-symbols-outlined text-[18px]"
                style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
              >
                {icon}
              </span>
              <span>{label}</span>
              {active && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="border-t border-white/5 p-4 m-2 rounded-xl bg-white/5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-indigo-700 text-[11px] font-bold text-white shadow-sm ring-1 ring-white/10">
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
