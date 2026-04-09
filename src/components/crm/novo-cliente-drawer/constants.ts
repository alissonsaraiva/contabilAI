export const PLANOS = [
  { value: 'essencial', label: 'Essencial' },
  { value: 'profissional', label: 'Profissional' },
  { value: 'empresarial', label: 'Empresarial' },
  { value: 'startup', label: 'Startup' },
]

export const REGIMES = [
  { value: 'MEI', label: 'MEI' },
  { value: 'SimplesNacional', label: 'Simples Nacional' },
  { value: 'LucroPresumido', label: 'Lucro Presumido' },
  { value: 'LucroReal', label: 'Lucro Real' },
  { value: 'Autonomo', label: 'Autônomo' },
]

export const FORMAS_PAGAMENTO = [
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'cartao', label: 'Cartão' },
]

export const ESTADO_CIVIL_OPTS = [
  { value: 'solteiro', label: 'Solteiro(a)' },
  { value: 'casado', label: 'Casado(a)' },
  { value: 'divorciado', label: 'Divorciado(a)' },
  { value: 'viuvo', label: 'Viúvo(a)' },
  { value: 'uniao_estavel', label: 'União estável' },
]

export const FORM_INIT = {
  nome: '',
  cpf: '',
  email: '',
  telefone: '',
  whatsapp: '',
  rg: '',
  dataNascimento: '',
  estadoCivil: '',
  nacionalidade: '',
  planoTipo: 'essencial',
  valorMensal: '',
  vencimentoDia: '5',
  formaPagamento: 'pix',
  tipoContribuinte: 'pj' as 'pj' | 'pf',
  profissao: '',
  cnpj: '',
  razaoSocial: '',
  regime: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  observacoesInternas: '',
}

export type NovoClienteForm = typeof FORM_INIT
