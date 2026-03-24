import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { formatBRL, formatCPF, formatDate } from '@/lib/utils'
import { STATUS_CLIENTE_LABELS, PLANO_LABELS, STATUS_CLIENTE_COLORS, PLANO_COLORS } from '@/types'
import { NovoClienteDrawer } from '@/components/crm/novo-cliente-drawer'
import { ClienteActionsMenu } from '@/components/crm/cliente-actions-menu'

export default async function ClientesPage() {
  const raw = await prisma.cliente.findMany({
    orderBy: { criadoEm: 'desc' },
    include: { responsavel: { select: { nome: true } } },
  })
  const clientes = raw.map((c) => ({ ...c, valorMensal: Number(c.valorMensal) }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-on-surface">
            Clientes
            <span className="rounded-md bg-surface-container-low px-2 py-0.5 text-xs font-bold text-on-surface-variant border border-outline-variant/20">
              {clientes.length} total
            </span>
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Gerenciamento completo da base de clientes ativos e inativos.
          </p>
        </div>
        <NovoClienteDrawer />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card shadow-sm">
        {clientes.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">
              Nenhum cliente ainda.
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full border-collapse text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-outline-variant/15">
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Nome</th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Documento</th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Cidade/UF</th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Plano</th>
                  <th className="px-6 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Valor/mês</th>
                  <th className="px-6 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Status</th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Desde</th>
                  <th className="px-6 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15">
                {clientes.map((c) => (
                  <tr key={c.id} className="group transition-colors hover:bg-surface-container-low/50">
                    <td className="px-6 py-3.5">
                      <Link href={`/crm/clientes/${c.id}`} className="block group/link">
                        <span className="text-[14px] font-semibold text-on-surface group-hover/link:text-primary transition-colors">{c.nome}</span>
                        <span className="block text-xs text-on-surface-variant/80 mt-0.5">{c.email}</span>
                      </Link>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="font-mono text-[13px] text-on-surface-variant/90">
                        {formatCPF(c.cpf)}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-[13px] text-on-surface-variant">
                      {c.cidade ? `${c.cidade}/${c.uf}` : '—'}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PLANO_COLORS[c.planoTipo] ?? 'bg-slate-100 text-slate-600'}`}>
                        {PLANO_LABELS[c.planoTipo]}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right text-[13px] font-semibold text-on-surface">
                      {formatBRL(Number(c.valorMensal))}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_CLIENTE_COLORS[c.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {STATUS_CLIENTE_LABELS[c.status]}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-[13px] text-on-surface-variant/80">
                      {c.dataInicio ? formatDate(c.dataInicio) : formatDate(c.criadoEm)}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <ClienteActionsMenu cliente={c} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
