'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { cn, getInitials } from '@/lib/utils'
import { AvosIcon } from '@/components/avos-logo'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

type Props = {
  user: { name?: string | null; email?: string | null }
  nomeEscritorio: string
  tipoContribuinte?: 'pj' | 'pf'
  docsNovos?: number
}

export function PortalHeader({ user, nomeEscritorio, tipoContribuinte = 'pj', docsNovos = 0 }: Props) {
  const isPF = tipoContribuinte === 'pf'

  const NAV_ITEMS = [
    { href: '/portal/dashboard',     icon: 'home',                        label: 'Início',      mobileLabel: 'Início',  badge: 0 },
    { href: '/portal/empresa',       icon: isPF ? 'badge' : 'domain',     label: isPF ? 'Dados' : 'Empresa', mobileLabel: isPF ? 'Dados' : 'Empresa', badge: 0 },
    { href: '/portal/documentos',    icon: 'folder_open',                 label: 'Documentos',  mobileLabel: 'Docs',    badge: docsNovos },
    { href: '/portal/financeiro',    icon: 'payments',                    label: 'Financeiro',  mobileLabel: 'Financ.', badge: 0 },
    { href: '/portal/suporte',       icon: 'support_agent',               label: 'Suporte',     mobileLabel: 'Suporte', badge: 0 },
    { href: '/portal/configuracoes', icon: 'settings',                    label: 'Config.',     mobileLabel: 'Config.', badge: 0 },
  ]
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center border-b border-outline-variant/15 bg-card/80 px-4 backdrop-blur-md md:px-8">
      {/* Brand */}
      <Link href="/portal/dashboard" className="flex items-center gap-2 mr-8 shrink-0">
        <AvosIcon size={32} className="shrink-0 rounded-lg shadow-sm" />
        <span className="hidden font-headline text-[15px] font-bold tracking-tight text-on-surface sm:block">
          {nomeEscritorio}
        </span>
      </Link>

      {/* Nav */}
      <nav className="hidden md:flex items-center gap-1 flex-1">
        {NAV_ITEMS.map(({ href, icon, label, badge }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative flex items-center gap-2 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-on-surface-variant/70 hover:bg-surface-container hover:text-on-surface',
              )}
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
              >
                {icon}
              </span>
              {label}
              {badge > 0 && (
                <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User dropdown */}
      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ring-offset-2 ring-offset-card">
            <Avatar className="h-8 w-8 cursor-pointer ring-1 ring-outline-variant/20">
              <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                {getInitials(user.name ?? 'C')}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5 shadow-lg border-outline-variant/15">
            <div className="px-2.5 py-2">
              <div className="flex flex-col space-y-0.5">
                <p className="text-[14px] font-semibold text-on-surface">{user.name}</p>
                <p className="text-[12px] text-on-surface-variant/80">{user.email}</p>
              </div>
            </div>
            <DropdownMenuSeparator className="bg-outline-variant/10 -mx-1.5" />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: '/portal/login' })}
              className="cursor-pointer rounded-md text-[13px] font-medium text-error focus:bg-error/10 focus:text-error px-2.5"
            >
              <span className="material-symbols-outlined mr-2 text-[18px]">logout</span>
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile nav — bottom bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden border-t border-outline-variant/15 bg-card/95 backdrop-blur-md pb-safe">
        {NAV_ITEMS.map(({ href, icon, mobileLabel, badge }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[9px] font-semibold uppercase transition-colors',
                active ? 'text-primary' : 'text-on-surface-variant/50',
              )}
            >
              <span className="relative inline-flex">
                <span
                  className="material-symbols-outlined text-[22px]"
                  style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {icon}
                </span>
                {badge > 0 && (
                  <span className="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[8px] font-bold text-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              {mobileLabel}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
