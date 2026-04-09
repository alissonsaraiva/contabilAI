export type CobrancaStatus = 'PENDING' | 'RECEIVED' | 'OVERDUE' | 'REFUNDED' | 'CANCELLED'

export type CobrancaAberta = {
  id: string
  valor: number
  vencimento: string
  status: CobrancaStatus
  formaPagamento: 'pix' | 'boleto'
  linkBoleto: string | null
  codigoBarras: string | null
  pixQrCode: string | null
  pixCopiaECola: string | null
  atualizadoEm: string | null
  pixExpirado?: boolean
}

export type CobrancaHistorico = {
  id: string
  valor: number
  vencimento: string
  status: CobrancaStatus
  formaPagamento: 'pix' | 'boleto'
  pagoEm: string | null
  valorPago: number | null
  invoiceUrl: string | null
}

export type DasMEIPortal = {
  id: string
  competencia: string
  valor: number | null
  dataVencimento: string | null
  codigoBarras: string | null
  urlDas: string | null
  status: 'pendente' | 'paga' | 'vencida' | 'erro'
  criadoEm: string
}

export type LimiteMEIData = {
  acumulado: number
  limite: number
  percentual: number
  zona: 'verde' | 'amarelo' | 'vermelho'
  restante: number
  ano: number
  porMes: { mes: number; ano: number; total: number }[]
}

export type PortalFinanceiroProps = {
  clienteId: string
  valorMensal: number
  vencimentoDia: number
  formaPagamento: string
  asaasAtivo: boolean
  regime?: string | null
  procuracaoRFAtiva?: boolean
}

// ─── Constantes de apresentação ──────────────────────────────────────────────

export const STATUS_LABEL: Record<CobrancaStatus, string> = {
  PENDING:   'Em aberto',
  RECEIVED:  'Pago',
  OVERDUE:   'Vencido',
  REFUNDED:  'Reembolsado',
  CANCELLED: 'Cancelado',
}

export const STATUS_COLOR: Record<CobrancaStatus, string> = {
  PENDING:   'bg-primary/10 text-primary',
  RECEIVED:  'bg-green-status/10 text-green-status',
  OVERDUE:   'bg-error/10 text-error',
  REFUNDED:  'bg-surface-container text-on-surface-variant',
  CANCELLED: 'bg-surface-container text-on-surface-variant',
}

export const FORMA_LABELS: Record<string, string> = {
  boleto: 'Boleto bancário',
  pix:    'PIX',
}

export const DAS_STATUS_LABEL: Record<DasMEIPortal['status'], string> = {
  pendente: 'Pendente',
  paga:     'Paga',
  vencida:  'Vencida',
  erro:     'Aguardando',
}

export const DAS_STATUS_COLOR: Record<DasMEIPortal['status'], string> = {
  pendente: 'bg-primary/10 text-primary',
  paga:     'bg-green-status/10 text-green-status',
  vencida:  'bg-error/10 text-error',
  erro:     'bg-orange-status/10 text-orange-status',
}

export function formatarCompetencia(comp: string): string {
  return `${comp.slice(4, 6)}/${comp.slice(0, 4)}`
}
