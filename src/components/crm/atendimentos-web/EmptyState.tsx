'use client'

export function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/20">{icon}</span>
      <p className="text-[12px] text-on-surface-variant/50">{text}</p>
    </div>
  )
}
