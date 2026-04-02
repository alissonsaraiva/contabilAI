'use client'

import type { Dispatch, SetStateAction } from 'react'
import type { FormState } from './_shared'
import { INPUT } from './_shared'

type Props = {
  erroMensagem: string | null | undefined
  form: FormState
  setForm: Dispatch<SetStateAction<FormState>>
  saving: boolean
  onClose: () => void
  onSubmit: () => void
}

export function ReemitirNfseModal({ erroMensagem, form, setForm, saving, onClose, onSubmit }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-outline-variant/15 p-5">
          <div>
            <h2 className="text-[15px] font-bold text-on-surface">Corrigir e reemitir NFS-e</h2>
            <p className="text-[12px] text-on-surface-variant/70">Corrija os dados que causaram a rejeição e reenvie</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {erroMensagem && (
          <div className="mx-5 mt-4 rounded-xl border border-error/20 bg-error/5 px-4 py-3">
            <p className="text-[11px] font-semibold text-error">Motivo da rejeição:</p>
            <p className="mt-0.5 text-[12px] text-error/80">{erroMensagem}</p>
          </div>
        )}

        <div className="p-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">
              Descrição do serviço <span className="text-error">*</span>
            </label>
            <textarea
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              rows={2}
              className="w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-[13px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 resize-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">
              Valor total (R$) <span className="text-error">*</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={form.valor}
              onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
              className={INPUT}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">
                Nome do tomador <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={form.tomadorNome}
                onChange={e => setForm(f => ({ ...f, tomadorNome: e.target.value }))}
                className={INPUT}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">
                CPF/CNPJ do tomador <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={form.tomadorCpfCnpj}
                onChange={e => setForm(f => ({ ...f, tomadorCpfCnpj: e.target.value }))}
                className={INPUT}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">E-mail do tomador</label>
            <input
              type="email"
              value={form.tomadorEmail}
              onChange={e => setForm(f => ({ ...f, tomadorEmail: e.target.value }))}
              className={INPUT}
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">Município do tomador</label>
              <input
                type="text"
                value={form.tomadorMunicipio}
                onChange={e => setForm(f => ({ ...f, tomadorMunicipio: e.target.value }))}
                className={INPUT}
              />
            </div>
            <div className="w-20">
              <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">UF</label>
              <input
                type="text"
                maxLength={2}
                value={form.tomadorEstado}
                onChange={e => setForm(f => ({ ...f, tomadorEstado: e.target.value.toUpperCase() }))}
                className={INPUT}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-outline-variant/15 p-4">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container"
          >
            Cancelar
          </button>
          <button
            onClick={onSubmit}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-tertiary px-5 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-tertiary/90 disabled:opacity-60"
          >
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <span className="material-symbols-outlined text-[15px]">replay</span>
            )}
            Reemitir NFS-e
          </button>
        </div>
      </div>
    </div>
  )
}
