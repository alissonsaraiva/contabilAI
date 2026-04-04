'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/crm/configuracoes/identidade', icon: 'domain', label: 'Dados Básicos' },
  { href: '/crm/configuracoes/contrato', icon: 'description', label: 'Contrato' },
  { href: '/crm/configuracoes/contato', icon: 'contact_mail', label: 'Contato' },
  { href: '/crm/configuracoes/integracoes', icon: 'extension', label: 'Integrações' },
  { href: '/crm/configuracoes/planos', icon: 'payments', label: 'Planos' },
  { href: '/crm/configuracoes/usuarios', icon: 'group', label: 'Usuários' },
  { href: '/crm/configuracoes/ia', icon: 'psychology', label: 'IA' },
  { href: '/crm/configuracoes/conhecimento', icon: 'auto_stories', label: 'Conhecimento' },
  { href: '/crm/configuracoes/email', icon: 'mail', label: 'E-mail' },
  { href: '/crm/configuracoes/whatsapp', icon: 'chat', label: 'WhatsApp' },
]

export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col gap-6 md:grid md:grid-cols-12 md:gap-8">
      {/* Vertical nav */}
      <nav className="flex overflow-x-auto pb-2 gap-2 md:col-span-3 md:flex-col md:pb-0 md:space-y-1 custom-scrollbar">
        {TABS.map(({ href, icon, label }) => {
          const active = pathname === href || pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center justify-between gap-3 shrink-0 md:shrink-auto rounded-xl px-3.5 py-3 transition-all',
                active
                  ? 'bg-surface-container-lowest text-primary shadow-sm ring-1 ring-outline-variant/10'
                  : 'text-on-surface-variant/80 hover:bg-surface-container-lowest hover:text-on-surface',
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className="material-symbols-outlined text-[18px]"
                  style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {icon}
                </span>
                <span className={cn('text-[13px]', active ? 'font-bold' : 'font-medium')}>{label}</span>
              </div>
              {active && (
                <span className="hidden md:block material-symbols-outlined text-[16px] text-primary/50">chevron_right</span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Content */}
      <section className="col-span-9 animate-in fade-in slide-in-from-bottom-4 duration-500">{children}</section>
    </div>
  )
}
