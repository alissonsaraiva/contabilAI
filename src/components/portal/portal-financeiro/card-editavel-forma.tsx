'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FORMA_LABELS } from './types'

type Props = {
  asaasAtivo: boolean
  forma: 'pix' | 'boleto'
  editando: boolean
  novaForma: 'pix' | 'boleto'
  setNovaForma: (forma: 'pix' | 'boleto') => void
  salvando: boolean
  erro: string | null
  onIniciarEdicao: () => void
  onCancelar: () => void
  onSalvar: () => void
}

export function CardEditavelForma({
  asaasAtivo, forma, editando, novaForma, setNovaForma,
  salvando, erro, onIniciarEdicao, onCancelar, onSalvar,
}: Props) {
  return (
    <Card className="border-outline-variant/15 bg-card/60 rounded-[16px] shadow-sm overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[22px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>credit_card</span>
          </div>
          {asaasAtivo && !editando && (
            <button
              onClick={onIniciarEdicao}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
              title="Alterar forma de pagamento"
            >
              <span className="material-symbols-outlined text-[14px]">edit</span>
              Alterar
            </button>
          )}
        </div>
        <p className="text-[12px] font-medium text-on-surface-variant/70">Forma de pagamento</p>
        {editando ? (
          <div className="mt-2 space-y-3">
            <div className="flex flex-col gap-2">
              {(['pix', 'boleto'] as const).map(op => (
                <label
                  key={op}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${novaForma === op ? 'border-primary bg-primary/5' : 'border-outline-variant/20 hover:bg-surface-container/40'}`}
                >
                  <input
                    type="radio"
                    name="forma"
                    value={op}
                    checked={novaForma === op}
                    onChange={() => setNovaForma(op)}
                    className="accent-primary"
                  />
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant/70" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {op === 'pix' ? 'qr_code_2' : 'receipt_long'}
                  </span>
                  <span className="text-sm font-medium text-on-surface">{FORMA_LABELS[op]}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-on-surface-variant/60">
              A cobrança em aberto será regenerada na nova forma em breve.
            </p>
            {erro && (
              <p className="text-[11px] text-error">{erro}</p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={onSalvar}
                disabled={salvando || novaForma === forma}
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
          <p className="text-[15px] font-bold text-on-surface mt-1">
            {FORMA_LABELS[forma] ?? forma}
          </p>
        )}
      </div>
    </Card>
  )
}
