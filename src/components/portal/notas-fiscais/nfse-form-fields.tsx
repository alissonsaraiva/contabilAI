'use client'

import { type FormState, INPUT, parseBRL, validarCpfCnpj } from './_shared'

type Props = {
  form: FormState
  onChange: (patch: Partial<FormState>) => void
  disabled?: boolean
  showSectionLabels?: boolean
  showValueHint?: boolean
}

/**
 * Campos de formulário NFS-e reutilizados nos modais de emissão e reemissão.
 * Renderiza tomador (nome, CPF/CNPJ, email, município, estado) + serviço (descrição, valor).
 */
export function NfseFormFields({ form, onChange, disabled, showSectionLabels = true, showValueHint = false }: Props) {
  return (
    <>
      {showSectionLabels && (
        <p className="text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant/50">
          Dados do tomador
        </p>
      )}

      <div>
        <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">
          Nome completo ou razão social <span className="text-error">*</span>
        </label>
        <input
          type="text"
          value={form.tomadorNome}
          onChange={e => onChange({ tomadorNome: e.target.value })}
          disabled={disabled}
          className={INPUT}
          placeholder="Ex: João da Silva ou Empresa ABC Ltda"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">
          CPF (pessoa física) ou CNPJ (empresa) <span className="text-error">*</span>
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={form.tomadorCpfCnpj}
          onChange={e => onChange({ tomadorCpfCnpj: e.target.value })}
          disabled={disabled}
          className={INPUT}
          placeholder="000.000.000-00 ou 00.000.000/0001-00"
        />
        {form.tomadorCpfCnpj && !validarCpfCnpj(form.tomadorCpfCnpj) && (
          <p className="mt-1 text-[11px] text-error">CPF deve ter 11 dígitos ou CNPJ 14 dígitos</p>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">
          E-mail do tomador
          <span className="ml-1 font-normal text-on-surface-variant/50">(opcional — para receber cópia da nota)</span>
        </label>
        <input
          type="email"
          value={form.tomadorEmail}
          onChange={e => onChange({ tomadorEmail: e.target.value })}
          disabled={disabled}
          className={INPUT}
          placeholder="contato@empresa.com"
        />
      </div>

      <div className="grid grid-cols-[1fr_80px] gap-3">
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">
            Município do tomador
            <span className="ml-1 font-normal text-on-surface-variant/50">(opcional)</span>
          </label>
          <input
            type="text"
            value={form.tomadorMunicipio}
            onChange={e => onChange({ tomadorMunicipio: e.target.value })}
            disabled={disabled}
            className={INPUT}
            placeholder="São Paulo"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">UF</label>
          <input
            type="text"
            maxLength={2}
            value={form.tomadorEstado}
            onChange={e => onChange({ tomadorEstado: e.target.value.toUpperCase() })}
            disabled={disabled}
            className={INPUT}
            placeholder="SP"
          />
        </div>
      </div>

      {showSectionLabels && (
        <p className="text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant/50">
          Dados do serviço
        </p>
      )}

      <div>
        <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">
          Descrição do serviço prestado <span className="text-error">*</span>
        </label>
        <textarea
          value={form.descricao}
          onChange={e => onChange({ descricao: e.target.value })}
          disabled={disabled}
          rows={2}
          className="w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-[13px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 resize-none"
          placeholder="Descreva o serviço que você prestou. Ex: Consultoria em gestão financeira — abril/2026"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">
          Valor total do serviço (R$) <span className="text-error">*</span>
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={form.valor}
          onChange={e => onChange({ valor: e.target.value })}
          disabled={disabled}
          className={INPUT}
          placeholder="3.000,00"
        />
        {showValueHint && (
          <p className="mt-1 text-[11px] text-on-surface-variant/50">
            Use vírgula para decimais. Ex: 3000,00 ou 3.000,00
          </p>
        )}
        {showValueHint && form.valor && !isNaN(parseBRL(form.valor)) && parseBRL(form.valor) > 0 && (
          <p className="mt-1 text-[11px] text-primary font-semibold">
            ✓ R$ {parseBRL(form.valor).toFixed(2).replace('.', ',')} — o ISS será calculado automaticamente pelo escritório.
          </p>
        )}
      </div>
    </>
  )
}
