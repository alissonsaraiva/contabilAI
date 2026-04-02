'use client'

export function PainelVazio({ onCompor }: { onCompor: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-container-low">
        <span className="material-symbols-outlined text-[32px] text-on-surface-variant/30" style={{ fontVariationSettings: "'FILL' 1" }}>forum</span>
      </div>
      <div>
        <p className="text-[14px] font-semibold text-on-surface/60">Selecione uma conversa</p>
        <p className="mt-1 text-[12px] text-on-surface-variant/40">ou componha um novo e-mail</p>
      </div>
      <button onClick={onCompor} className="flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-[13px] font-semibold text-primary hover:bg-primary/20 transition-colors">
        <span className="material-symbols-outlined text-[16px]">edit</span>
        Novo e-mail
      </button>
    </div>
  )
}
