'use client'

type Props = {
  nomeExibido: string
  telefone: string | null
  pausada: boolean
  reativando: boolean
  assumindo: boolean
  conversaId: string | null
  mensagensCount: number
  onClose: () => void
  onReativarIA: () => void
  onAssumir: () => void
}

export function ChatHeader({
  nomeExibido, telefone, pausada, reativando, assumindo,
  conversaId, mensagensCount, onClose, onReativarIA, onAssumir,
}: Props) {
  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-outline-variant/15 px-4 lg:px-5 py-4">
      <div className="flex items-center gap-2 lg:gap-3">
        <button
          onClick={onClose}
          className="lg:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant/60 transition-colors hover:bg-surface-container hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div className="hidden lg:flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#25D366]/15">
          <span
            className="material-symbols-outlined text-[18px] text-[#25D366]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            chat_bubble
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-on-surface">{nomeExibido}</p>
          <p className="text-[11px] text-on-surface-variant">{telefone ?? 'WhatsApp'}</p>
        </div>
        <button
          onClick={onClose}
          className="hidden lg:flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant/60 transition-colors hover:bg-surface-container hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      {pausada ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-orange-status/10 px-2.5 py-1 text-[11px] font-semibold text-orange-status">
            <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              support_agent
            </span>
            Você no controle
          </span>
          <button
            onClick={onReativarIA}
            disabled={reativando}
            className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              smart_toy
            </span>
            {reativando ? 'Devolvendo...' : 'Devolver para IA'}
          </button>
        </div>
      ) : (conversaId || mensagensCount > 0) ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-[#25D366]/10 px-2.5 py-1 text-[11px] font-semibold text-[#25D366]">
            <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              smart_toy
            </span>
            IA ativa
          </span>
          {conversaId && (
            <button
              onClick={onAssumir}
              disabled={assumindo}
              className="flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[13px]">support_agent</span>
              {assumindo ? 'Assumindo...' : 'Assumir'}
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
