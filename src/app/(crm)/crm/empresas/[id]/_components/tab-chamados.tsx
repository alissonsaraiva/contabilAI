import Link from 'next/link'
import { EmptyState } from '@/components/crm/info-card'
import { NovoChamadoDrawer } from '@/components/crm/novo-chamado-drawer'
import { STATUS_CHAMADO, TIPO_CHAMADO, PRIORIDADE_COLOR } from '@/types'

type Chamado = {
  id: string
  numero: number
  titulo: string
  tipo: string
  status: string
  prioridade: string
  criadoEm: Date
  cliente: { nome: string }
}

type Props = {
  chamados: Chamado[]
  cliente: { id: string; nome: string } | null
}

export function TabChamados({ chamados, cliente }: Props) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] text-on-surface-variant">
          {chamados.length === 0
            ? 'Nenhum chamado registrado para esta empresa.'
            : `${chamados.length} chamado${chamados.length !== 1 ? 's' : ''}`}
        </p>
        {cliente && (
          <NovoChamadoDrawer clientes={[{ id: cliente.id, nome: cliente.nome }]} />
        )}
      </div>

      {chamados.length === 0 ? (
        <EmptyState icon="inbox" msg="Nenhum chamado registrado para esta empresa" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/10 bg-surface-container-lowest/40">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50 w-[60px]">#</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50">Chamado</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50 hidden md:table-cell">Tipo</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50">Status</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50 hidden lg:table-cell">Data</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {chamados.map(c => {
                  const s = STATUS_CHAMADO[c.status] ?? STATUS_CHAMADO['aberta']!
                  const prioClass = PRIORIDADE_COLOR[c.prioridade] ?? 'text-on-surface-variant/50'
                  return (
                    <tr key={c.id} className="border-b border-outline-variant/10 last:border-0 hover:bg-surface-container/40 transition-colors">
                      <td className="px-4 py-3.5 text-[12px] font-mono text-on-surface-variant/50 tabular-nums">
                        #{c.numero}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className={`material-symbols-outlined text-[14px] shrink-0 ${prioClass}`} style={{ fontVariationSettings: "'FILL' 1" }}>circle</span>
                          <p className="text-[13px] font-medium text-on-surface truncate max-w-[240px]">{c.titulo}</p>
                        </div>
                        <p className="text-[11px] text-on-surface-variant/60 ml-5">{c.cliente.nome}</p>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <span className="text-[12px] text-on-surface-variant">{TIPO_CHAMADO[c.tipo] ?? c.tipo}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.color}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <span className="text-[12px] text-on-surface-variant/60">
                          {new Date(c.criadoEm).toLocaleDateString('pt-BR')}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/crm/chamados/${c.id}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/60 hover:bg-surface-container hover:text-primary transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
