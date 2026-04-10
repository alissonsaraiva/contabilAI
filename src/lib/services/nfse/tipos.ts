import type { StatusNotaFiscal } from '@prisma/client'

export type { StatusNotaFiscal }

export interface EmitirNotaInput {
  clienteId: string
  /** ID da empresa emissora. Se omitido, resolve a principal do cliente. */
  empresaId?: string
  ordemServicoId?: string
  descricao: string
  valor: number                  // valor total em reais
  tomadorNome: string
  tomadorCpfCnpj: string        // somente números (CPF 11 ou CNPJ 14)
  tomadorEmail?: string
  tomadorMunicipio?: string
  tomadorEstado?: string
  // Overrides fiscais (usa defaults do Escritório/Empresa se não informado)
  issAliquota?: number
  issRetido?: boolean
  federalServiceCode?: string
  cityServiceCode?: string
  taxationType?: string
  emitidaPorId?: string          // null = agente/automático
}

export interface EmitirNotaResult {
  sucesso: true
  notaFiscalId: string
  status: StatusNotaFiscal
  mensagem: string
}

export interface EmitirNotaErro {
  sucesso: false
  motivo: 'nao_configurado' | 'municipio_nao_integrado' | 'dados_incompletos' | 'erro_spedy' | 'erro_interno'
  detalhe: string
}

export type EmitirNotaOutput = EmitirNotaResult | EmitirNotaErro
