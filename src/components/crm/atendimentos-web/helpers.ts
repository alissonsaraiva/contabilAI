import { getNomeFromDadosJson } from '@/lib/schemas/lead-dados-json'
import type { ConversaWebItem } from './types'

export function getApiPath(c: ConversaWebItem): string | null {
  if (c.canal !== 'whatsapp') return null
  if (c.socioId) return `/api/socios/${c.socioId}/whatsapp`
  if (c.cliente) return `/api/clientes/${c.cliente.id}/whatsapp`
  if (c.lead)    return `/api/leads/${c.lead.id}/whatsapp`
  return null
}

export function getNome(c: ConversaWebItem): string {
  return (
    c.cliente?.nome ??
    getNomeFromDadosJson(c.lead?.dadosJson) ??
    c.lead?.contatoEntrada ??
    c.remoteJid?.replace('@s.whatsapp.net', '') ??
    'Desconhecido'
  )
}

export function getInitials(nome: string): string {
  return nome
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function formatTimeShort(dateStr: string): string {
  const d    = new Date(dateStr)
  const now  = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000)      return 'agora'
  if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000)  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
