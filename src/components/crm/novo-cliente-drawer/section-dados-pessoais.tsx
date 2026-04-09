import { INPUT, FormField, FormSelect, SectionTitle } from '../_form-primitives'
import { ESTADO_CIVIL_OPTS, type NovoClienteForm } from './constants'
import { formatCPF, formatTelefone } from '@/lib/utils'

interface Props {
  form: NovoClienteForm
  set: (field: keyof NovoClienteForm, value: string) => void
  erros: Record<string, string>
}

export function SectionDadosPessoais({ form, set, erros }: Props) {
  return (
    <>
      <SectionTitle first>Dados pessoais</SectionTitle>

      <FormField label="Nome completo" required error={erros.nome}>
        <input
          className={INPUT}
          placeholder="Ex: João da Silva"
          value={form.nome}
          onChange={e => set('nome', e.target.value)}
          autoFocus
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="CPF" required error={erros.cpf}>
          <input
            className={INPUT}
            placeholder="000.000.000-00"
            value={form.cpf}
            onChange={e => set('cpf', formatCPF(e.target.value))}
            inputMode="numeric"
            maxLength={14}
          />
        </FormField>
        <FormField label="Telefone" required error={erros.telefone}>
          <input
            className={INPUT}
            placeholder="(11) 99999-9999"
            value={form.telefone}
            onChange={e => set('telefone', formatTelefone(e.target.value))}
            inputMode="tel"
            maxLength={15}
          />
        </FormField>
      </div>

      <FormField label="E-mail" required error={erros.email}>
        <input
          type="email"
          className={INPUT}
          placeholder="joao@empresa.com"
          value={form.email}
          onChange={e => set('email', e.target.value)}
        />
      </FormField>

      <FormField label="WhatsApp">
        <input
          className={INPUT}
          placeholder="(11) 99999-9999"
          value={form.whatsapp}
          onChange={e => set('whatsapp', formatTelefone(e.target.value))}
          inputMode="tel"
          maxLength={15}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="RG">
          <input
            className={INPUT}
            placeholder="00.000.000-0"
            value={form.rg}
            onChange={e => set('rg', e.target.value)}
          />
        </FormField>
        <FormField label="Data de nascimento">
          <input
            type="date"
            className={INPUT}
            value={form.dataNascimento}
            onChange={e => set('dataNascimento', e.target.value)}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormSelect
          label="Estado civil"
          value={form.estadoCivil}
          onChange={v => set('estadoCivil', v)}
          options={ESTADO_CIVIL_OPTS}
        />
        <FormField label="Nacionalidade">
          <input
            className={INPUT}
            placeholder="Brasileira"
            value={form.nacionalidade}
            onChange={e => set('nacionalidade', e.target.value)}
          />
        </FormField>
      </div>
    </>
  )
}
