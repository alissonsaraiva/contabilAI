import type {
  Usuario,
  Lead,
  Cliente,
  Socio,
  Contrato,
  Tarefa,
  Interacao,
  Notificacao,
  Plano,
  Escritorio,
  TipoUsuario,
  PlanoTipo,
  StatusLead,
  StatusCliente,
  StatusContrato,
  StatusTarefa,
  Prioridade,
  Canal,
  FormaPagamento,
  Regime,
} from '@prisma/client'

export type {
  Usuario,
  Lead,
  Cliente,
  Socio,
  Contrato,
  Tarefa,
  Interacao,
  Notificacao,
  Plano,
  Escritorio,
  TipoUsuario,
  PlanoTipo,
  StatusLead,
  StatusCliente,
  StatusContrato,
  StatusTarefa,
  Prioridade,
  Canal,
  FormaPagamento,
  Regime,
}

export type LeadComRelacoes = Lead & {
  responsavel?: Pick<Usuario, 'id' | 'nome' | 'avatar'> | null
  contrato?: Pick<Contrato, 'id' | 'status'> | null
  cliente?: Pick<Cliente, 'id'> | null
}

export type ClienteComRelacoes = Cliente & {
  responsavel?: Pick<Usuario, 'id' | 'nome' | 'avatar'> | null
  socios?: Socio[]
}

export type SessionUser = {
  id: string
  name: string
  email: string
  tipo: TipoUsuario
}

export type ApiResponse<T> = {
  data?: T
  error?: string
  message?: string
}

export type PaginatedResponse<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const PLANO_LABELS: Record<PlanoTipo, string> = {
  essencial: 'Essencial',
  profissional: 'Profissional',
  empresarial: 'Empresarial',
  startup: 'Startup',
}

export const STATUS_LEAD_LABELS: Record<StatusLead, string> = {
  iniciado: 'Iniciado',
  simulador: 'Simulador',
  plano_escolhido: 'Plano escolhido',
  dados_preenchidos: 'Dados preenchidos',
  socios_preenchidos: 'Sócios preenchidos',
  revisao: 'Revisão',
  contrato_gerado: 'Contrato gerado',
  aguardando_assinatura: 'Ag. assinatura',
  assinado: 'Assinado',
  expirado: 'Expirado',
  cancelado: 'Cancelado',
}

export const STATUS_CONTRATO_LABELS: Record<StatusContrato, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aguardando_assinatura: 'Ag. Assinatura',
  parcialmente_assinado: 'Parcial',
  assinado: 'Assinado',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
}

export const STATUS_CLIENTE_LABELS: Record<StatusCliente, string> = {
  ativo: 'Ativo',
  inadimplente: 'Inadimplente',
  suspenso: 'Suspenso',
  cancelado: 'Cancelado',
  encerrado: 'Encerrado',
}

export const CANAL_LABELS: Record<Canal, string> = {
  site: 'Site',
  whatsapp: 'WhatsApp',
  indicacao: 'Indicação',
  instagram: 'Instagram',
  google: 'Google',
  outro: 'Outro',
}

export const FORMA_PAGAMENTO_LABELS: Record<FormaPagamento, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  cartao: 'Cartão',
}

/* ── Badge styles centralizados ──────────────────────────────
 * Padrão: bg-{cor}/10 text-{cor} (tokens MD3 quando disponível,
 * Tailwind semântico quando não há equivalente MD3)
 * ─────────────────────────────────────────────────────────── */

export const CANAL_COLORS: Record<Canal, string> = {
  site:      'bg-primary/10 text-primary',
  whatsapp:  'bg-green-status/10 text-green-status',
  instagram: 'bg-pink-500/10 text-pink-600',
  google:    'bg-blue-500/10 text-blue-600',
  indicacao: 'bg-orange-status/10 text-orange-status',
  outro:     'bg-surface-container text-on-surface-variant',
}

export const STATUS_LEAD_COLORS: Record<StatusLead, string> = {
  iniciado:             'bg-surface-container text-on-surface-variant',
  simulador:            'bg-primary/10 text-primary',
  plano_escolhido:      'bg-tertiary/10 text-tertiary',
  dados_preenchidos:    'bg-primary/15 text-primary',
  socios_preenchidos:   'bg-blue-600/10 text-blue-700',
  revisao:              'bg-tertiary/15 text-tertiary',
  contrato_gerado:      'bg-green-status/10 text-green-status',
  aguardando_assinatura:'bg-orange-status/10 text-orange-status',
  assinado:             'bg-green-status/10 text-green-status',
  cancelado:            'bg-error/10 text-error',
  expirado:             'bg-surface-container text-on-surface-variant',
}

export const PLANO_COLORS: Record<PlanoTipo, string> = {
  essencial:    'bg-primary/10 text-primary',
  profissional: 'bg-tertiary/10 text-tertiary',
  empresarial:  'bg-blue-700/10 text-blue-800',
  startup:      'bg-green-status/10 text-green-status',
}

export const STATUS_CLIENTE_COLORS: Record<StatusCliente, string> = {
  ativo:        'bg-green-status/10 text-green-status',
  inadimplente: 'bg-error/10 text-error',
  suspenso:     'bg-orange-status/10 text-orange-status',
  cancelado:    'bg-surface-container text-on-surface-variant',
  encerrado:    'bg-surface-container text-on-surface-variant',
}
