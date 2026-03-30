/**
 * Substituição de variáveis no template de contrato.
 * As variáveis no template seguem o padrão {{nomeVariavel}}.
 */

export interface ContratoVariaveis {
  // Cliente
  nomeCliente?: string
  cpf?: string
  rg?: string
  email?: string
  telefone?: string
  cnpj?: string
  razaoSocial?: string
  nomeFantasia?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  uf?: string
  cep?: string
  // Contrato
  plano?: string
  valor?: string
  vencimento?: string
  formaPagamento?: string
  dataContrato?: string
  // Escritório
  escritorioNome?: string
  escritorioCnpj?: string
  escritorioCrc?: string
  escritorioCidade?: string
  escritorioEndereco?: string
}

export function substituirVariaveis(template: string, vars: ContratoVariaveis): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = vars[key as keyof ContratoVariaveis]
    return value ?? match
  })
}

export function buildContratoVariaveis(params: {
  dados: Record<string, string> | null
  plano: string
  valor: number
  vencimentoDia: number
  formaPagamento: string
  assinadoEm: Date
  escritorioNome: string
  escritorioCnpj?: string | null
  escritorioCrc?: string | null
  escritorioCidade?: string | null
  escritorioLogradouro?: string | null
  escritorioNumero?: string | null
  escritorioBairro?: string | null
  escritorioUf?: string | null
  escritorioCep?: string | null
}): ContratoVariaveis {
  const { dados, plano, valor, vencimentoDia, formaPagamento, assinadoEm } = params

  const PLANO_LABELS: Record<string, string> = {
    essencial: 'Essencial',
    profissional: 'Profissional',
    empresarial: 'Empresarial',
    startup: 'Startup',
  }
  const FORMA_LABELS: Record<string, string> = {
    pix: 'PIX',
    boleto: 'Boleto Bancário',
    cartao: 'Cartão de Crédito/Débito',
  }

  const escritorioEndereco = [
    params.escritorioLogradouro,
    params.escritorioNumero,
    params.escritorioBairro,
    params.escritorioCidade,
    params.escritorioUf,
    params.escritorioCep ? `CEP ${params.escritorioCep}` : undefined,
  ].filter(Boolean).join(', ')

  return {
    nomeCliente:  dados?.['Nome completo'],
    cpf:          dados?.['CPF'],
    rg:           dados?.['RG'],
    email:        dados?.['E-mail'],
    telefone:     dados?.['Telefone'],
    cnpj:         dados?.['CNPJ'],
    razaoSocial:  dados?.['Razão Social'],
    nomeFantasia: dados?.['Nome Fantasia'],
    logradouro:   dados?.['Logradouro'] ?? dados?.['Endereço'],
    numero:       dados?.['Número'],
    complemento:  dados?.['Complemento'],
    bairro:       dados?.['Bairro'],
    cidade:       dados?.['Cidade'],
    uf:           dados?.['UF'] ?? dados?.['Estado'],
    cep:          dados?.['CEP'],
    plano:        PLANO_LABELS[plano] ?? plano,
    valor:        `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    vencimento:   String(vencimentoDia),
    formaPagamento: FORMA_LABELS[formaPagamento] ?? formaPagamento,
    dataContrato: assinadoEm.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    escritorioNome:    params.escritorioNome,
    escritorioCnpj:    params.escritorioCnpj ?? undefined,
    escritorioCrc:     params.escritorioCrc ?? undefined,
    escritorioCidade:  params.escritorioCidade ?? undefined,
    escritorioEndereco: escritorioEndereco || undefined,
  }
}
