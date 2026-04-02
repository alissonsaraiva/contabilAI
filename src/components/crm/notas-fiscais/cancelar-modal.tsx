'use client'

type Props = {
  notaId: string
  autorizadaEm: string | null
  justificativa: string
  onJustificativaChange: (v: string) => void
  cancelando: boolean
  onClose: () => void
  onConfirmar: (notaId: string) => void
}

export function CancelarNfseModal({
  notaId,
  autorizadaEm,
  justificativa,
  onJustificativaChange,
  cancelando,
  onClose,
  onConfirmar,
}: Props) {
  const autorizadaDate         = autorizadaEm ? new Date(autorizadaEm) : null
  const diasDesdeAutorizacao   = autorizadaDate
    ? Math.floor((Date.now() - autorizadaDate.getTime()) / 86_400_000)
    : null
  const prazoExpirado  = diasDesdeAutorizacao !== null && diasDesdeAutorizacao > 30
  const prazoProximo   = diasDesdeAutorizacao !== null && diasDesdeAutorizacao >= 25 && !prazoExpirado

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl">
        <div className="border-b border-outline-variant/15 p-5">
          <h2 className="text-[15px] font-bold text-error">Cancelar NFS-e</h2>
          <p className="text-[12px] text-on-surface-variant/70">Esta ação pode não ser reversível dependendo do município e prazo legal.</p>
        </div>

        {prazoExpirado && (
          <div className="mx-5 mt-4 flex items-start gap-2 rounded-xl bg-error/10 px-3 py-2.5 text-error">
            <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">warning</span>
            <p className="text-[12px] font-semibold">
              Prazo legal excedido — esta nota foi autorizada há {diasDesdeAutorizacao} dias. A maioria dos municípios permite cancelamento apenas nos primeiros 30 dias. Verifique junto ao município antes de prosseguir.
            </p>
          </div>
        )}
        {prazoProximo && (
          <div className="mx-5 mt-4 flex items-start gap-2 rounded-xl bg-orange-status/10 px-3 py-2.5 text-orange-status">
            <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">timer</span>
            <p className="text-[12px] font-semibold">
              Atenção: prazo próximo — nota autorizada há {diasDesdeAutorizacao} dias. O prazo legal de 30 dias vence em {30 - diasDesdeAutorizacao!} dias.
            </p>
          </div>
        )}

        <div className="p-5 space-y-3">
          <label className="block text-[12px] font-semibold text-on-surface-variant">
            Justificativa do cancelamento <span className="text-error">*</span>{' '}
            <span className="text-on-surface-variant/50">(mín. 15 caracteres)</span>
          </label>
          <textarea
            value={justificativa}
            onChange={e => onJustificativaChange(e.target.value)}
            rows={3}
            className="w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-[13px] text-on-surface shadow-sm transition-colors focus:border-error/50 focus:outline-none focus:ring-[3px] focus:ring-error/10 placeholder:text-on-surface-variant/40 resize-none"
            placeholder="Descreva o motivo do cancelamento..."
          />
          <p className="text-[11px] text-on-surface-variant/50">{justificativa.length}/15 caracteres mínimos</p>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-outline-variant/15 p-4">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container"
          >
            Voltar
          </button>
          <button
            onClick={() => onConfirmar(notaId)}
            disabled={cancelando || justificativa.length < 15}
            className="flex items-center gap-2 rounded-xl bg-error px-5 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-error/90 disabled:opacity-60"
          >
            {cancelando ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <span className="material-symbols-outlined text-[15px]">remove_circle</span>
            )}
            Confirmar cancelamento
          </button>
        </div>
      </div>
    </div>
  )
}
