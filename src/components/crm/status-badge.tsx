import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { StatusLead, StatusCliente, PlanoTipo, Canal } from '@/types'

const STATUS_LEAD_COLORS: Record<string, string> = {
  iniciado: 'bg-slate-100 text-slate-700',
  simulador: 'bg-blue-100 text-blue-700',
  plano_escolhido: 'bg-cyan-100 text-cyan-700',
  dados_preenchidos: 'bg-yellow-100 text-yellow-700',
  socios_preenchidos: 'bg-orange-100 text-orange-700',
  revisao: 'bg-purple-100 text-purple-700',
  contrato_gerado: 'bg-indigo-100 text-indigo-700',
  aguardando_assinatura: 'bg-pink-100 text-pink-700',
  assinado: 'bg-green-100 text-green-700',
  expirado: 'bg-red-100 text-red-700',
  cancelado: 'bg-red-100 text-red-700',
}

const STATUS_CLIENTE_COLORS: Record<string, string> = {
  ativo: 'bg-green-100 text-green-700',
  inadimplente: 'bg-red-100 text-red-700',
  suspenso: 'bg-yellow-100 text-yellow-700',
  cancelado: 'bg-slate-100 text-slate-700',
  encerrado: 'bg-slate-100 text-slate-700',
}

const PLANO_COLORS: Record<string, string> = {
  essencial: 'bg-slate-100 text-slate-700',
  profissional: 'bg-blue-100 text-blue-700',
  empresarial: 'bg-purple-100 text-purple-700',
  startup: 'bg-orange-100 text-orange-700',
}

const CANAL_COLORS: Record<string, string> = {
  site: 'bg-blue-100 text-blue-700',
  whatsapp: 'bg-green-100 text-green-700',
  indicacao: 'bg-yellow-100 text-yellow-700',
  instagram: 'bg-pink-100 text-pink-700',
  google: 'bg-red-100 text-red-700',
  outro: 'bg-slate-100 text-slate-700',
}

type Props = {
  type: 'lead' | 'cliente' | 'plano' | 'canal'
  value: string
  label: string
}

export function StatusBadge({ type, value, label }: Props) {
  const colorMap = {
    lead: STATUS_LEAD_COLORS,
    cliente: STATUS_CLIENTE_COLORS,
    plano: PLANO_COLORS,
    canal: CANAL_COLORS,
  }[type]

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        colorMap[value] ?? 'bg-slate-100 text-slate-700',
      )}
    >
      {label}
    </span>
  )
}
