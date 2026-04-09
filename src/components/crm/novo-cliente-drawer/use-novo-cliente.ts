import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useCnpj } from '@/hooks/use-cnpj'
import { useCep } from '@/hooks/use-cep'
import { FORM_INIT, type NovoClienteForm } from './constants'

export function useNovoCliente() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<NovoClienteForm>(FORM_INIT)
  const [erros, setErros] = useState<Record<string, string>>({})
  const { buscarCnpj, loading: cnpjLoading } = useCnpj()
  const { buscarCep, loading: cepLoading } = useCep()

  function set(field: keyof NovoClienteForm, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    setErros(e => ({ ...e, [field]: '' }))
  }

  function reset() {
    setForm(FORM_INIT)
    setErros({})
  }

  async function preencherCEP(cep: string) {
    await buscarCep(cep, (d) => {
      setForm(f => ({
        ...f,
        logradouro: d.logradouro || f.logradouro,
        bairro: d.bairro || f.bairro,
        cidade: d.cidade || f.cidade,
        uf: d.uf || f.uf,
      }))
    })
  }

  async function preencherCNPJ(cnpj: string) {
    const dados = await buscarCnpj(cnpj)
    if (!dados) return
    setForm(f => ({
      ...f,
      razaoSocial: dados.razaoSocial || f.razaoSocial,
      cidade: dados.municipio || f.cidade,
      uf: dados.uf || f.uf,
      regime: dados.regime !== 'outro' ? dados.regime : f.regime,
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErros: Record<string, string> = {}
    if (!form.nome.trim() || form.nome.length < 2) newErros.nome = 'Nome obrigatório (mín. 2 caracteres)'
    if (!form.cpf.replace(/\D/g, '') || form.cpf.replace(/\D/g, '').length < 11) newErros.cpf = 'CPF inválido'
    if (!form.email.includes('@')) newErros.email = 'E-mail inválido'
    if (!form.telefone || form.telefone.replace(/\D/g, '').length < 8) newErros.telefone = 'Telefone inválido'
    if (!form.valorMensal || isNaN(Number(form.valorMensal)) || Number(form.valorMensal) <= 0) newErros.valorMensal = 'Valor inválido'
    if (Object.keys(newErros).length) { setErros(newErros); return }

    setLoading(true)
    try {
      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome,
          cpf: form.cpf.replace(/\D/g, ''),
          email: form.email,
          telefone: form.telefone,
          whatsapp: form.whatsapp || undefined,
          rg: form.rg || undefined,
          dataNascimento: form.dataNascimento || undefined,
          estadoCivil: form.estadoCivil || undefined,
          nacionalidade: form.nacionalidade || undefined,
          planoTipo: form.planoTipo,
          valorMensal: Number(form.valorMensal),
          vencimentoDia: Number(form.vencimentoDia),
          formaPagamento: form.formaPagamento,
          tipoContribuinte: form.tipoContribuinte,
          profissao: form.tipoContribuinte === 'pf' ? (form.profissao || undefined) : undefined,
          cnpj: form.tipoContribuinte === 'pj' ? (form.cnpj || undefined) : undefined,
          razaoSocial: form.tipoContribuinte === 'pj' ? (form.razaoSocial || undefined) : undefined,
          regime: form.regime || (form.tipoContribuinte === 'pf' ? 'Autonomo' : undefined),
          cep: form.cep || undefined,
          logradouro: form.logradouro || undefined,
          numero: form.numero || undefined,
          complemento: form.complemento || undefined,
          bairro: form.bairro || undefined,
          cidade: form.cidade || undefined,
          uf: form.uf || undefined,
          observacoesInternas: form.observacoesInternas || undefined,
        }),
      })
      if (res.status === 409) {
        toast.error('CPF ou e-mail já cadastrado')
        return
      }
      if (!res.ok) throw new Error()
      toast.success('Cliente cadastrado!')
      setOpen(false)
      reset()
      router.refresh()
    } catch {
      toast.error('Erro ao cadastrar cliente')
    } finally {
      setLoading(false)
    }
  }

  return {
    open, setOpen, loading, form, erros, set, reset, handleSubmit,
    cnpjLoading, cepLoading, preencherCEP, preencherCNPJ,
  }
}
