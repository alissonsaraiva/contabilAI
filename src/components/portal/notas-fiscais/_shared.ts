import { differenceInDays } from 'date-fns'
import { validarCPF, validarCNPJ } from '@/lib/utils'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type NotaFiscal = {
  id: string
  numero: number | null
  status: string
  descricao: string
  valorTotal: number
  issValor: number | null
  issRetido: boolean
  tomadorNome: string | null
  tomadorCpfCnpj: string | null
  tomadorEmail: string | null
  tomadorMunicipio: string | null
  tomadorEstado: string | null
  protocolo: string | null
  erroMensagem: string | null
  canceladaEm: string | null
  spedyId: string | null
  autorizadaEm: string | null
  criadoEm: string
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

export const FORM_VAZIO: FormState = {
  descricao:        '',
  valor:            '',
  tomadorNome:      '',
  tomadorCpfCnpj:   '',
  tomadorEmail:     '',
  tomadorMunicipio: '',
  tomadorEstado:    '',
}

// ─── Status ───────────────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<string, string> = {
  autorizada:   'Autorizada',
  cancelada:    'Cancelada',
  processando:  'Processando',
  enviando:     'Enviando',
  rejeitada:    'Rejeitada',
  erro_interno: 'Erro',
}

export const STATUS_COLORS: Record<string, string> = {
  autorizada:   'bg-green-500/10 text-green-600',
  cancelada:    'bg-gray-100 text-gray-500',
  processando:  'bg-blue-500/10 text-blue-600',
  enviando:     'bg-purple-500/10 text-purple-600',
  rejeitada:    'bg-red-500/10 text-red-600',
  erro_interno: 'bg-orange-500/10 text-orange-600',
}

export const STATUS_ICONS: Record<string, string> = {
  autorizada:   'check_circle',
  cancelada:    'remove_circle',
  processando:  'hourglass_empty',
  enviando:     'upload',
  rejeitada:    'cancel',
  erro_interno: 'error',
}

// ─── CSS input base ───────────────────────────────────────────────────────────

export const INPUT = 'w-full h-10 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-3 text-[13px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Converte valor digitado em formato BR (3.000,00 ou 3000,00 ou 3000.00) para número. */
export function parseBRL(raw: string): number {
  const s = raw.trim()
  if (!s) return NaN
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.'))
  return parseFloat(s)
}

export function formatCnpj(cnpj: string): string {
  const n = cnpj.replace(/\D/g, '')
  if (n.length !== 14) return cnpj
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`
}

export function validarCpfCnpj(v: string): boolean {
  const n = v.replace(/\D/g, '')
  if (n.length === 11) return validarCPF(n)
  if (n.length === 14) return validarCNPJ(n)
  return false
}

export function podeCancelar(nota: NotaFiscal): boolean {
  if (nota.status !== 'autorizada' || !nota.autorizadaEm) return false
  return differenceInDays(new Date(), new Date(nota.autorizadaEm)) <= 30
}

export function cancelamentoPrazoEsgotado(nota: NotaFiscal): boolean {
  if (nota.status !== 'autorizada' || !nota.autorizadaEm) return false
  return differenceInDays(new Date(), new Date(nota.autorizadaEm)) > 30
}
