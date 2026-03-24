'use client'

import { usePathname } from 'next/navigation'
import { Bell, HelpCircle } from 'lucide-react'
import { signOut } from 'next-auth/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { LogOut } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import type { SessionUser } from '@/types'

function resolveTitle(pathname: string): string {
  if (pathname === '/crm/dashboard') return 'Painel de Controle'
  if (pathname === '/crm/leads') return 'Leads'
  if (/^\/crm\/leads\/.+/.test(pathname)) return 'Detalhes do Lead'
  if (pathname === '/crm/clientes') return 'Clientes'
  if (/^\/crm\/clientes\/.+/.test(pathname)) return 'Detalhes do Cliente'
  if (pathname === '/crm/tarefas') return 'Tarefas'
  if (pathname.startsWith('/crm/configuracoes')) return 'Configurações'
  return 'ContabAI'
}

type Props = { user: SessionUser }

export function CrmHeader({ user }: Props) {
  const pathname = usePathname()
  const title = resolveTitle(pathname)

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-outline-variant/15 bg-card/80 px-8 backdrop-blur-md">
      {/* Page title */}
      <h2 className="font-headline text-lg font-semibold tracking-tight text-on-surface">{title}</h2>

      {/* Right side: search + actions */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative mr-2">
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
          <button className="flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant/70 transition-colors hover:bg-surface-container hover:text-on-surface">
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 0" }}>notifications</span>
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant/70 transition-colors hover:bg-surface-container hover:text-on-surface">
            <span className="material-symbols-outlined text-[20px]">help_outline</span>
          </button>

          <div className="mx-2 h-6 w-px bg-outline-variant/20" />

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
    </header>
  )
}
