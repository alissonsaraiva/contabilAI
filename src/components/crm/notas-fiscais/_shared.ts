// Tipos e constantes compartilhados pelos subcomponentes de notas-fiscais-tab

export type NotaFiscal = {
  id: string
  numero: number | null
  status: string
  descricao: string
  valorTotal: number
  issValor: number | null
  issRetido: boolean
  tomadorNome: string
  tomadorCpfCnpj: string
  tomadorEmail: string | null
  tomadorMunicipio: string | null
  tomadorEstado: string | null
  protocolo: string | null
  erroCodigo: string | null
  erroMensagem: string | null
  spedyId: string | null
  autorizadaEm: string | null
  criadoEm: string
  solicitadaPeloPortal?: boolean
}

export type FormState = {
  descricao: string
  valor: string
  tomadorNome: string
  tomadorCpfCnpj: string
  tomadorEmail: string
  tomadorMunicipio: string
  tomadorEstado: string
}

export const INITIAL_FORM: FormState = {
  descricao: '',
  valor: '',
  tomadorNome: '',
  tomadorCpfCnpj: '',
  tomadorEmail: '',
  tomadorMunicipio: '',
  tomadorEstado: '',
}

export const STATUS_LABELS: Record<string, string> = {
  autorizada:   'Autorizada',
  rejeitada:    'Rejeitada',
  cancelada:    'Cancelada',
  processando:  'Processando',
  enviando:     'Enviando',
  rascunho:     'Rascunho',
  erro_interno: 'Erro interno',
}

export const STATUS_COLORS: Record<string, string> = {
  autorizada:   'bg-green-status/10 text-green-status',
  rejeitada:    'bg-error/10 text-error',
  cancelada:    'bg-surface-container text-on-surface-variant',
  processando:  'bg-primary/10 text-primary',
  enviando:     'bg-tertiary/10 text-tertiary',
  rascunho:     'bg-surface-container text-on-surface-variant',
  erro_interno: 'bg-orange-status/10 text-orange-status',
}

export const STATUS_ICONS: Record<string, string> = {
  autorizada:   'check_circle',
  rejeitada:    'cancel',
  cancelada:    'remove_circle',
  processando:  'hourglass_empty',
  enviando:     'upload',
  rascunho:     'draft',
  erro_interno: 'error',
}

// Classe CSS base para inputs do formulário NFS-e
export const INPUT = 'w-full h-10 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-3 text-[13px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
