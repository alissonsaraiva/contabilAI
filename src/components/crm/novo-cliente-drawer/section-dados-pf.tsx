import { INPUT, FormField, SectionTitle } from '../_form-primitives'
import type { NovoClienteForm } from './constants'

interface Props {
  form: NovoClienteForm
  set: (field: keyof NovoClienteForm, value: string) => void
}

export function SectionDadosPF({ form, set }: Props) {
  if (form.tipoContribuinte !== 'pf') return null

  return (
    <>
      <SectionTitle>Dados profissionais</SectionTitle>

      <FormField label="Profissão">
        <input
          className={INPUT}
          placeholder="Ex: Médico, Dentista, Advogado"
          value={form.profissao}
          onChange={e => set('profissao', e.target.value)}
        />
      </FormField>
    </>
  )
}
