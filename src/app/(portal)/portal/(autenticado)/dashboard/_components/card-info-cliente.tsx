import { PLANO_LABELS } from '@/types'

const REGIME_LABEL: Record<string, string> = {
  MEI:             'MEI',
  SimplesNacional: 'Simples Nacional',
  LucroPresumido:  'Lucro Presumido',
  LucroReal:       'Lucro Real',
  Autonomo:        'Autônomo',
}

type Props = {
  tipoContribuinte: string
  cpf?: string | null
  planoTipo: string
  responsavelNome?: string | null
  empresa?: {
    cnpj?: string | null
    razaoSocial?: string | null
    regime?: string | null
  } | null
}

export function CardInfoCliente({ tipoContribuinte, cpf, planoTipo, responsavelNome, empresa }: Props) {
  const regime = empresa?.regime ?? null
  const isPf = tipoContribuinte === 'pf'

  return (
    <div className="rounded-[16px] border border-outline-variant/15 bg-card shadow-sm p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className="material-symbols-outlined text-[20px] text-on-surface-variant"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {isPf ? 'badge' : 'domain'}
        </span>
        <h2 className="font-headline text-[14px] font-semibold text-on-surface">
          {isPf ? 'Meus dados' : 'Minha empresa'}
        </h2>
      </div>
      <dl className="space-y-2.5">
        {empresa?.cnpj && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">CNPJ</dt>
            <dd className="mt-0.5 text-[13px] font-medium text-on-surface">{empresa.cnpj}</dd>
          </div>
        )}
        {!empresa && cpf && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">CPF</dt>
            <dd className="mt-0.5 text-[13px] font-medium text-on-surface">{cpf}</dd>
          </div>
        )}
        {empresa?.razaoSocial && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Razão social</dt>
            <dd className="mt-0.5 truncate text-[13px] font-medium text-on-surface" title={empresa.razaoSocial}>
              {empresa.razaoSocial}
            </dd>
          </div>
        )}
        {regime && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Regime tributário</dt>
            <dd className="mt-0.5 text-[13px] font-medium text-on-surface">{REGIME_LABEL[regime] ?? regime}</dd>
          </div>
        )}
        {responsavelNome && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Contador responsável</dt>
            <dd className="mt-0.5 text-[13px] font-medium text-on-surface">{responsavelNome}</dd>
          </div>
        )}
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Plano</dt>
          <dd className="mt-0.5">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
              {PLANO_LABELS[planoTipo as keyof typeof PLANO_LABELS] ?? planoTipo}
            </span>
          </dd>
        </div>
      </dl>
    </div>
  )
}
