import type { ReactNode } from 'react'

export function InfoCard({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-outline-variant/20 bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-outline-variant/5 bg-surface-container-lowest/40 px-5 py-4">
        <span className="material-symbols-outlined text-[18px] text-primary/80">{icon}</span>
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/80">{title}</h2>
      </div>
      <div className="flex-1 px-5 py-5">{children}</div>
    </div>
  )
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-outline-variant/5 last:border-b-0">
      <span className="shrink-0 text-[12px] font-semibold uppercase tracking-widest text-on-surface-variant/50">{label}</span>
      <span className="text-right text-[13px] font-medium text-on-surface">{value}</span>
    </div>
  )
}

export function EmptyState({ icon, msg }: { icon: string; msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant/40 py-16 text-center">
      <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/25" style={{ fontVariationSettings: "'FILL' 0" }}>{icon}</span>
      <p className="text-sm text-on-surface-variant">{msg}</p>
    </div>
  )
}

export function PlaceholderTab({ icon, label, descricao }: { icon: string; label: string; descricao: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant/40 py-20 text-center gap-3">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-container">
        <span className="material-symbols-outlined text-[28px] text-on-surface-variant/40" style={{ fontVariationSettings: "'FILL' 0" }}>{icon}</span>
      </div>
      <div>
        <p className="font-semibold text-on-surface-variant">{label} — em breve</p>
        <p className="mt-1 text-sm text-on-surface-variant/60 max-w-sm">{descricao}</p>
      </div>
    </div>
  )
}
