import { cn } from '@/lib/utils'

const REGIME_LABEL: Record<string, string> = {
  MEI:             'MEI',
  SimplesNacional: 'Simples Nacional',
  LucroPresumido:  'Lucro Presumido',
  LucroReal:       'Lucro Real',
  Autonomo:        'Autônomo',
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

/**
 * Retorna "Mês/Ano" do próximo vencimento anual de um dado mês.
 * Se o mês ainda não passou neste ano, usa o ano corrente; caso contrário, o próximo.
 * Ex: chamado em Mar/2026 com mes=4 (Abril) → "Abr/2026"
 *     chamado em Mai/2026 com mes=4 (Abril) → "Abr/2027"
 */
function proximoAnual(mes: number): string {
  const agora = new Date()
  const mesAtual = agora.getMonth() + 1 // 1-12
  const ano = mesAtual < mes ? agora.getFullYear() : agora.getFullYear() + 1
  return `${MESES[mes - 1]}/${ano}`
}

function getObrigacoes(
  regime: string | null | undefined,
  tipo: string,
): { label: string; vence: string; cor: string }[] {
  if (tipo === 'pf') {
    return [
      { label: 'IRPF — Imposto de Renda PF',   vence: proximoAnual(4), cor: 'text-orange-status' },
      { label: 'CARNÊ-LEÃO (se aplicável)',      vence: 'Mensal',        cor: 'text-primary' },
    ]
  }
  if (regime === 'MEI') {
    return [
      { label: 'DAS-MEI',                        vence: 'Dia 20/mês',   cor: 'text-primary' },
      { label: 'DASN-SIMEI (anual)',              vence: proximoAnual(5), cor: 'text-orange-status' },
      { label: 'NF de Serviços (se prestador)',   vence: 'Mensal',        cor: 'text-on-surface-variant' },
    ]
  }
  if (regime === 'SimplesNacional') {
    return [
      { label: 'DAS — Simples Nacional',          vence: 'Dia 20/mês',   cor: 'text-primary' },
      { label: 'DEFIS (anual)',                   vence: proximoAnual(3), cor: 'text-orange-status' },
      { label: 'DCTF (se aplicável)',             vence: 'Mensal',        cor: 'text-on-surface-variant' },
    ]
  }
  return [
    { label: 'DCTF Mensal',              vence: 'Dia 15/mês',    cor: 'text-primary' },
    { label: 'EFD-Contribuições',        vence: 'Dia 10/mês',    cor: 'text-orange-status' },
    { label: 'SPED Contábil (anual)',    vence: proximoAnual(6), cor: 'text-on-surface-variant' },
    { label: 'ECF (anual)',              vence: proximoAnual(7), cor: 'text-on-surface-variant' },
  ]
}

type Props = {
  regime: string | null
  tipo: string
  nomeIa: string
}

export function CardObrigacoes({ regime, tipo, nomeIa }: Props) {
  const obrigacoes = getObrigacoes(regime, tipo)

  return (
    <div className="rounded-[16px] border border-outline-variant/15 bg-card shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant/10 p-4 sm:px-5 sm:py-4">
        <div className="flex items-center gap-2.5">
          <span
            className="material-symbols-outlined text-[20px] text-on-surface-variant"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            event
          </span>
          <h2 className="font-headline text-[14px] font-semibold text-on-surface">Obrigações fiscais</h2>
        </div>
        {regime && (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            {REGIME_LABEL[regime] ?? regime}
          </span>
        )}
      </div>
      <ul className="divide-y divide-outline-variant/8">
        {obrigacoes.map((o, i) => (
          <li key={i} className="flex items-center justify-between gap-4 p-4 sm:px-5 sm:py-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-2 w-2 shrink-0 rounded-full bg-current opacity-60" style={{ color: 'currentcolor' }} />
              <p className={cn('text-[13px] font-medium truncate', o.cor)}>{o.label}</p>
            </div>
            <span className="shrink-0 text-[12px] font-semibold text-on-surface-variant/70">{o.vence}</span>
          </li>
        ))}
      </ul>
      <div className="border-t border-outline-variant/8 px-5 py-3">
        <p className="text-[11px] text-on-surface-variant/50">
          Dúvidas sobre obrigações? Abra um chamado ou fale com {nomeIa}.
        </p>
      </div>
    </div>
  )
}
