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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import type { SessionUser } from '@/types'

const NAV_ITEMS = [
  { href: '/crm/dashboard',    icon: 'dashboard',    label: 'Dashboard' },
  { href: '/crm/prospeccao',   icon: 'contact_phone', label: 'Prospecção' },
  { href: '/crm/leads',        icon: 'rocket_launch', label: 'Onboarding' },
  { href: '/crm/clientes',     icon: 'group',        label: 'Clientes' },
  { href: '/crm/tarefas',      icon: 'check_circle', label: 'Tarefas' },
  { href: '/crm/configuracoes', icon: 'settings',    label: 'Configurações' },
]

function resolveTitle(pathname: string): string {
  if (pathname === '/crm/dashboard') return 'Painel de Controle'
  if (pathname === '/crm/prospeccao') return 'Prospecção'
  if (pathname === '/crm/leads') return 'Onboarding'
  if (/^\/crm\/leads\/.+/.test(pathname)) return 'Detalhes do Lead'
  if (pathname === '/crm/clientes') return 'Clientes'
  if (/^\/crm\/clientes\/.+/.test(pathname)) return 'Detalhes do Cliente'
  if (pathname === '/crm/tarefas') return 'Tarefas'
  if (pathname.startsWith('/crm/configuracoes')) return 'Configurações'
  return 'ContabAI'
}

type Props = { user: SessionUser }

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
      } catch {
        // silencia erros de rede
      }
    }
    check()
    const id = setInterval(check, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  return anyDown
}

export function CrmHeader({ user }: Props) {
  const pathname = usePathname()
  const title = resolveTitle(pathname)
  const [mobileOpen, setMobileOpen] = useState(false)
  const aiDown = useAiHealthAlert()

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
          <button className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant/70 transition-colors hover:bg-surface-container hover:text-on-surface">
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 0" }}>notifications</span>
          </button>
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
              <DropdownMenuLabel className="font-normal px-2.5 py-2">
                <div className="flex flex-col space-y-1">
                  <p className="text-[14px] font-semibold text-on-surface">{user.name}</p>
                  <p className="text-[12px] font-medium text-on-surface-variant/80">{user.email}</p>
                </div>
              </DropdownMenuLabel>
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
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_15px_rgba(99,102,241,0.3)]">
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                calculate
              </span>
            </div>
            <div>
              <h1 className="text-[15px] font-semibold tracking-tight text-white mb-0.5">ContabAI</h1>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 leading-none">Workspace</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-1 px-4 py-4">
            <div className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-widest text-white/30">Menu Principal</div>
            {NAV_ITEMS.map(({ href, icon, label }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
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
        </SheetContent>
      </Sheet>
    </header>
  )
}
