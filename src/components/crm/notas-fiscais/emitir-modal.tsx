'use client'

import type { Dispatch, SetStateAction } from 'react'
import type { FormState } from './_shared'
import { INPUT } from './_shared'

type Props = {
  form: FormState
  setForm: Dispatch<SetStateAction<FormState>>
  saving: boolean
  onClose: () => void
  onSubmit: () => void
}

export function EmitirNfseModal({ form, setForm, saving, onClose, onSubmit }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-outline-variant/15 p-5">
          <div>
            <h2 className="text-[15px] font-bold text-on-surface">Emitir NFS-e</h2>
            <p className="text-[12px] text-on-surface-variant/70">Revise os dados antes de emitir</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

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
              placeholder="Ex: Consultoria contábil mensal — março/2026"
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
              placeholder="3000,00"
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
                placeholder="Empresa ABC Ltda"
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
                placeholder="12.345.678/0001-90"
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
              placeholder="financeiro@empresa.com"
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
                placeholder="São Paulo"
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
                placeholder="SP"
              />
            </div>
          </div>

          <div className="rounded-xl border border-orange-status/20 bg-orange-status/5 p-3 text-[11px] text-on-surface-variant/80">
            <strong className="text-orange-status">Atenção:</strong> a NFS-e será enviada para processamento na prefeitura e o status será atualizado automaticamente. A emissão pode ser irreversível após a autorização.
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
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-[13px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <span className="material-symbols-outlined text-[15px]">send</span>
            )}
            Emitir NFS-e
          </button>
        </div>
      </div>
    </div>
  )
}
