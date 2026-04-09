'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export function Section({
  icon, title, subtitle, configCount, defaultOpen = false, children,
}: {
  icon: string
  title: string
  subtitle: string
  configCount: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-3 p-5 text-left transition-colors hover:bg-surface-container-low/60"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
            {icon}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-on-surface">{title}</h3>
            {configCount > 0 && (
              <span className="flex items-center gap-0.5 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-600">
                <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                {configCount} configurado{configCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-[12px] text-on-surface-variant/80">{subtitle}</p>
        </div>
        <span
          className={cn(
            'material-symbols-outlined text-[20px] text-on-surface-variant/50 transition-transform duration-200 shrink-0',
            open && 'rotate-180',
          )}
        >
          expand_more
        </span>
      </button>

      {open && (
        <div className="border-t border-outline-variant/10 p-5 space-y-5">
          {children}
        </div>
      )}
    </div>
  )
}
