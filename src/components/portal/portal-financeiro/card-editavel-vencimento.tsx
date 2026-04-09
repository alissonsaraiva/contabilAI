'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Props = {
  asaasAtivo: boolean
  diaVencimento: number
  editando: boolean
  novoVencimentoDia: number
  setNovoVencimentoDia: (dia: number) => void
  salvando: boolean
  erro: string | null
  onIniciarEdicao: () => void
  onCancelar: () => void
  onSalvar: () => void
}

export function CardEditavelVencimento({
  asaasAtivo, diaVencimento, editando, novoVencimentoDia,
  setNovoVencimentoDia, salvando, erro, onIniciarEdicao, onCancelar, onSalvar,
}: Props) {
  return (
    <Card className="border-outline-variant/15 bg-card/60 rounded-[16px] shadow-sm overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[22px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>event_repeat</span>
          </div>
          {asaasAtivo && !editando && (
            <button
              onClick={onIniciarEdicao}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
              title="Alterar dia de vencimento"
            >
              <span className="material-symbols-outlined text-[14px]">edit</span>
              Alterar
            </button>
          )}
        </div>
        <p className="text-[12px] font-medium text-on-surface-variant/70">Dia de vencimento</p>
        {editando ? (
          <div className="mt-2 space-y-3">
            <select
              value={novoVencimentoDia}
              onChange={e => setNovoVencimentoDia(Number(e.target.value))}
              className="w-full rounded-xl border border-outline-variant/30 bg-surface-container/50 px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>Dia {d}</option>
              ))}
            </select>
            <p className="text-[10px] text-on-surface-variant/60">
              A alteração será aplicada também à cobrança em aberto.
            </p>
            {erro && (
              <p className="text-[11px] text-error">{erro}</p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={onSalvar}
                disabled={salvando || novoVencimentoDia === diaVencimento}
                className="flex-1 text-xs gap-1"
              >
                {salvando
                  ? <><span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> Salvando…</>
                  : <><span className="material-symbols-outlined text-[12px]">check</span> Salvar</>
                }
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onCancelar}
                disabled={salvando}
                className="text-xs"
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xl font-bold text-on-surface mt-1">Todo dia {diaVencimento}</p>
        )}
      </div>
    </Card>
  )
}
