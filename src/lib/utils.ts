import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBRL(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(valor))
}

export function formatCPF(cpf: string): string {
  const n = cpf.replace(/\D/g, '')
  return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

export function formatCNPJ(cnpj: string): string {
  const n = cnpj.replace(/\D/g, '')
  return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

export function formatTelefone(tel: string): string {
  const n = tel.replace(/\D/g, '')
  return n.length === 11
    ? n.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
    : n.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
}

export function formatDate(data: Date | string): string {
  return format(new Date(data), 'dd/MM/yyyy', { locale: ptBR })
}

export function formatDateTime(data: Date | string): string {
  return format(new Date(data), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

export function validarCPF(cpf: string): boolean {
  const n = cpf.replace(/\D/g, '')
  if (n.length !== 11 || /^(\d)\1+$/.test(n)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(n[i]) * (10 - i)
  let d = 11 - (sum % 11)
  if (d > 9) d = 0
  if (d !== parseInt(n[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(n[i]) * (11 - i)
  d = 11 - (sum % 11)
  if (d > 9) d = 0
  return d === parseInt(n[10])
}

export function validarCNPJ(cnpj: string): boolean {
  const n = cnpj.replace(/\D/g, '')
  if (n.length !== 14 || /^(\d)\1+$/.test(n)) return false
  const calc = (s: string, len: number) => {
    let sum = 0
    let pos = len - 7
    for (let i = len; i >= 1; i--) {
      sum += parseInt(s[len - i]) * pos--
      if (pos < 2) pos = 9
    }
    return sum % 11 < 2 ? 0 : 11 - (sum % 11)
  }
  return calc(n, 12) === parseInt(n[12]) && calc(n, 13) === parseInt(n[13])
}

export function getInitials(nome: string): string {
  return nome
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
