'use client'

type Props = {
  title: string
  items: string[]
  footer?: string
}

export function InfoBox({ title, items, footer }: Props) {
  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[16px] text-blue-500" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
        <p className="text-[12px] font-semibold text-blue-600">{title}</p>
      </div>
      <ul className="space-y-1 text-[11px] text-on-surface-variant/80">
        {items.map((item, i) => <li key={i}>• {item}</li>)}
      </ul>
      {footer && <p className="text-[11px] text-on-surface-variant/60 pt-1">{footer}</p>}
    </div>
  )
}
