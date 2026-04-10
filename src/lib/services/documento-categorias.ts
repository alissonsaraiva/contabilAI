import type { CategoriaDocumento } from '@prisma/client'

export const CATEGORIAS_DOCUMENTO: { value: CategoriaDocumento; label: string }[] = [
  { value: 'geral',          label: 'Geral' },
  { value: 'nota_fiscal',    label: 'Nota Fiscal' },
  { value: 'imposto_renda',  label: 'Imposto de Renda' },
  { value: 'guias_tributos', label: 'Guias / Tributos' },
  { value: 'relatorios',     label: 'Relatórios' },
  { value: 'outros',         label: 'Outros' },
]

export const CATEGORIAS_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIAS_DOCUMENTO.map(c => [c.value, c.label]),
)

export const STATUS_DOCUMENTO = ['pendente', 'aprovado', 'rejeitado', 'enviado', 'vencido'] as const

export const STATUS_DOCUMENTO_OPTIONS: { value: string; label: string }[] = [
  { value: 'pendente',  label: 'Pendente' },
  { value: 'aprovado',  label: 'Aprovado' },
  { value: 'rejeitado', label: 'Rejeitado' },
  { value: 'enviado',   label: 'Enviado' },
  { value: 'vencido',   label: 'Vencido' },
]

export const STATUS_DOCUMENTO_COLORS: Record<string, string> = {
  pendente:  'bg-orange-status/10 text-orange-status',
  aprovado:  'bg-green-status/10 text-green-status',
  rejeitado: 'bg-error/10 text-error',
  enviado:   'bg-primary/10 text-primary',
  vencido:   'bg-error/10 text-error',
}

export const ORIGEM_DOCUMENTO_COLORS: Record<string, string> = {
  portal:      'bg-primary/10 text-primary',
  crm:         'bg-green-status/10 text-green-status',
  integracao:  'bg-tertiary/10 text-tertiary',
}

export const ORIGEM_DOCUMENTO_LABELS: Record<string, string> = {
  portal:     'Cliente',
  crm:        'Escritório',
  integracao: 'Integração',
}
