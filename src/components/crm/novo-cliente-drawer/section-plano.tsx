import { INPUT, FormField, FormSelect, SectionTitle } from '../_form-primitives'
import { PLANOS, FORMAS_PAGAMENTO, type NovoClienteForm } from './constants'

interface Props {
  form: NovoClienteForm
  set: (field: keyof NovoClienteForm, value: string) => void
  erros: Record<string, string>
}

export function SectionPlano({ form, set, erros }: Props) {
  return (
    <>
      <SectionTitle>Plano e pagamento</SectionTitle>

      <div className="grid grid-cols-2 gap-4">
        <FormSelect
          label="Plano"
          required
          value={form.planoTipo}
          onChange={v => set('planoTipo', v)}
          options={PLANOS}
          placeholder=""
        />
        <FormField label="Valor mensal" required error={erros.valorMensal}>
          <input
            type="number"
            min="0"
            step="0.01"
            className={INPUT}
            placeholder="299.90"
            value={form.valorMensal}
            onChange={e => set('valorMensal', e.target.value)}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormSelect
          label="Forma de pagamento"
          required
          value={form.formaPagamento}
          onChange={v => set('formaPagamento', v)}
          options={FORMAS_PAGAMENTO}
          placeholder=""
        />
        <FormField label="Vencimento (dia)">
          <input
            type="number"
            min="1"
            max="31"
            className={INPUT}
            placeholder="5"
            value={form.vencimentoDia}
            onChange={e => set('vencimentoDia', e.target.value)}
          />
        </FormField>
      </div>

      <SectionTitle>Observações internas</SectionTitle>

      <FormField label="">
        <textarea
          className={INPUT + ' h-24 resize-none py-3'}
          placeholder="Notas internas sobre o cliente (não visível no portal)"
          value={form.observacoesInternas}
          onChange={e => set('observacoesInternas', e.target.value)}
        />
      </FormField>
    </>
  )
}
