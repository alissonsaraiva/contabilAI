import type { ThreadItem } from '@/app/(crm)/crm/emails/page'

export type { ThreadItem }
export type { MensagemThread } from '@/app/(crm)/crm/emails/page'

export type ClienteOpt   = { id: string; nome: string; email: string | null }
export type Aba          = 'entrada' | 'tratados' | 'enviados'
export type PainelDireito = { tipo: 'vazio' } | { tipo: 'thread'; thread: ThreadItem } | { tipo: 'compor' }
export type VincularEstado = 'idle' | 'selecionando' | 'salvando'
