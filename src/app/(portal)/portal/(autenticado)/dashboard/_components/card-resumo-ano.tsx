import { prisma } from '@/lib/prisma'
import { formatBRL } from '@/lib/utils'

type Props = {
  clienteId: string
  valorMensal: number
  dataInicio: Date | null
}

export async function CardResumoAno({ clienteId, valorMensal, dataInicio }: Props) {
  const [docsTotal, chamadosTotal] = await Promise.all([
    prisma.documento.count({ where: { clienteId, deletadoEm: null } }),
    prisma.chamado.count({ where: { clienteId } }),
  ])

  const anosConosco = dataInicio
    ? new Date().getFullYear() - new Date(dataInicio).getFullYear()
    : null

  return (
    <div className="rounded-[16px] border border-outline-variant/15 bg-card shadow-sm p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className="material-symbols-outlined text-[20px] text-on-surface-variant"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          bar_chart
        </span>
        <h2 className="font-headline text-[14px] font-semibold text-on-surface">Resumo do ano</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface-container-low p-3 text-center">
          <p className="text-[24px] font-bold text-primary leading-none">{docsTotal}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Documentos</p>
        </div>
        <div className="rounded-xl bg-surface-container-low p-3 text-center">
          <p className="text-[24px] font-bold text-on-surface leading-none">{chamadosTotal}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Chamados</p>
        </div>
        <div className="rounded-xl bg-surface-container-low p-3 text-center">
          <p className="text-[24px] font-bold text-green-status leading-none">{formatBRL(valorMensal)}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Mensalidade</p>
        </div>
        <div className="rounded-xl bg-surface-container-low p-3 text-center">
          <p className="text-[24px] font-bold text-on-surface leading-none">
            {anosConosco ?? '—'}
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Anos conosco</p>
        </div>
      </div>
    </div>
  )
}
