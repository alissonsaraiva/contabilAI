import { INPUT, FormField, FormSelect, SectionTitle } from '../_form-primitives'
import { REGIMES, type NovoClienteForm } from './constants'
import { formatCNPJ } from '@/lib/utils'

interface Props {
  form: NovoClienteForm
  set: (field: keyof NovoClienteForm, value: string) => void
  cnpjLoading: boolean
  preencherCNPJ: (cnpj: string) => void
}

export function SectionDadosPJ({ form, set, cnpjLoading, preencherCNPJ }: Props) {
  if (form.tipoContribuinte !== 'pj') return null

  return (
    <>
      <SectionTitle>Dados empresariais (opcional)</SectionTitle>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="CNPJ">
          <div className="relative">
            <input
              className={INPUT}
              placeholder="00.000.000/0001-00"
              value={form.cnpj}
              onChange={e => {
                const v = formatCNPJ(e.target.value)
                set('cnpj', v)
                if (v.replace(/\D/g, '').length === 14) preencherCNPJ(v)
              }}
              inputMode="numeric"
              maxLength={18}
            />
            {cnpjLoading && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            )}
          </div>
        </FormField>
        <FormSelect
          label="Regime"
          value={form.regime}
          onChange={v => set('regime', v)}
          options={REGIMES.filter(r => r.value !== 'Autonomo')}
        />
      </div>

      <FormField label="Razão social">
        <input
          className={INPUT}
          placeholder="Nome da empresa"
          value={form.razaoSocial}
          onChange={e => set('razaoSocial', e.target.value)}
        />
      </FormField>
    </>
  )
}
