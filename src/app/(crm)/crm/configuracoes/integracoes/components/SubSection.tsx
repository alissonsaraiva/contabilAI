'use client'

type Props = {
  title: string
  subtitle?: string
  badge?: string
  children: React.ReactNode
}

export function SubSection({ title, subtitle, badge, children }: Props) {
  return (
    <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low/40 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-on-surface-variant">{title}</p>
        {badge && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{badge}</span>
        )}
      </div>
      {subtitle && <p className="text-[11px] text-on-surface-variant/70 -mt-2">{subtitle}</p>}
      {children}
    </div>
  )
}
