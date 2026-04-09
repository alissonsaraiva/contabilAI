import { INPUT, FormField, SectionTitle } from '../_form-primitives'
import type { NovoClienteForm } from './constants'

interface Props {
  form: NovoClienteForm
  set: (field: keyof NovoClienteForm, value: string) => void
  cepLoading: boolean
  preencherCEP: (cep: string) => void
}

export function SectionEndereco({ form, set, cepLoading, preencherCEP }: Props) {
  return (
    <>
      <SectionTitle>Endereço</SectionTitle>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <FormField label="Logradouro">
            <input
              className={INPUT}
              placeholder="Rua das Flores"
              value={form.logradouro}
              onChange={e => set('logradouro', e.target.value)}
            />
          </FormField>
        </div>
        <FormField label="Número">
          <input
            className={INPUT}
            placeholder="123"
            value={form.numero}
            onChange={e => set('numero', e.target.value)}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Complemento">
          <input
            className={INPUT}
            placeholder="Apto 4B"
            value={form.complemento}
            onChange={e => set('complemento', e.target.value)}
          />
        </FormField>
        <FormField label="Bairro">
          <input
            className={INPUT}
            placeholder="Centro"
            value={form.bairro}
            onChange={e => set('bairro', e.target.value)}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <FormField label="CEP">
          <input
            className={INPUT}
            placeholder="00000-000"
            value={form.cep}
            onChange={e => {
              const v = e.target.value
              set('cep', v)
              if (v.replace(/\D/g, '').length === 8) preencherCEP(v)
            }}
            inputMode="numeric"
            maxLength={9}
            disabled={cepLoading}
          />
        </FormField>
        <FormField label="Cidade">
          <input
            className={INPUT}
            placeholder="São Paulo"
            value={form.cidade}
            onChange={e => set('cidade', e.target.value)}
          />
        </FormField>
        <FormField label="UF">
          <input
            className={INPUT}
            placeholder="SP"
            maxLength={2}
            value={form.uf}
            onChange={e => set('uf', e.target.value.toUpperCase())}
          />
        </FormField>
      </div>
    </>
  )
}
