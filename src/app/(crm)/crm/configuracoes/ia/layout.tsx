'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const SUB_TABS = [
  { href: '/crm/configuracoes/ia',               label: 'Configuração',       icon: 'tune',          exact: true },
  { href: '/crm/configuracoes/ia/saude',         label: 'Saúde',              icon: 'monitor_heart', exact: false },
  { href: '/crm/configuracoes/ia/log',           label: 'Agente Operacional', icon: 'smart_toy',     exact: false },
  { href: '/crm/configuracoes/ia/agendamentos',  label: 'Agendamentos',       icon: 'schedule',      exact: false },
  { href: '/crm/configuracoes/ia/logs',          label: 'Logs',               icon: 'history',       exact: false },
]

export default function IaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-outline-variant pb-0">
        {SUB_TABS.map(({ href, label, icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant',
              )}
            >
              <span
                className="material-symbols-outlined text-[16px]"
                style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
              >
                {icon}
              </span>
              {label}
            </Link>
          )
        })}
      </div>

      {children}
    </div>
  )
}
