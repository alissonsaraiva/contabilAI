import { prisma } from '@/lib/prisma'
import { formatBRL, formatCPF, formatDate } from '@/lib/utils'
import { STATUS_CLIENTE_LABELS, PLANO_LABELS, STATUS_CLIENTE_COLORS, PLANO_COLORS } from '@/types'
import { NovoClienteDrawer } from '@/components/crm/novo-cliente-drawer'
import { ClienteActionsMenu } from '@/components/crm/cliente-actions-menu'
import { ClienteRow } from '@/components/crm/cliente-row'
import { ClientesSearchBar } from '@/components/crm/clientes-search-bar'
import { ClientesPaginacao } from '@/components/crm/clientes-paginacao'
import { Suspense } from 'react'

const PER_PAGE = 10

type Props = {
  searchParams: Promise<{ q?: string; page?: string; status?: string; plano?: string }>
}

export default async function ClientesPage({ searchParams }: Props) {
  const { q = '', page: pageParam, status, plano } = await searchParams
  const page = Math.max(1, Number(pageParam ?? '1'))

  const skip = (page - 1) * PER_PAGE
  const qClean = q.replace(/\D/g, '')

  const searchWhere = q ? { OR: [
    { nome:     { contains: q,      mode: 'insensitive' as const } },
    { email:    { contains: q,      mode: 'insensitive' as const } },
    { cpf:      { contains: qClean } },
    { telefone: { contains: qClean.length >= 4 ? qClean : q } },
    { empresa:  { cnpj:       { contains: qClean } } },
    { empresa:  { razaoSocial: { contains: q, mode: 'insensitive' as const } } },
  ]} : {}

  const filterWhere = {
    AND: [
      searchWhere,
      status ? { status:    status as any } : {},
      plano  ? { planoTipo: plano  as any } : {},
    ],
  }

  const [raw, total] = await Promise.all([
    prisma.cliente.findMany({
      where: filterWhere,
      orderBy: { criadoEm: 'desc' },
      skip,
      take: PER_PAGE,
      include: { responsavel: { select: { nome: true } }, empresa: { select: { cnpj: true, razaoSocial: true, regime: true } } },
    }),
    prisma.cliente.count({ where: filterWhere }),
  ])

  const clientes = raw.map((c: typeof raw[number]) => ({
    ...c,
    valorMensal: Number(c.valorMensal),
    dataNascimento: c.dataNascimento ? c.dataNascimento.toISOString() : null,
    cnpj: c.empresa?.cnpj ?? null,
    razaoSocial: c.empresa?.razaoSocial ?? null,
    regime: c.empresa?.regime ?? null,
  }))
  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-on-surface">
            Clientes
            <span className="rounded-md bg-surface-container-low px-2 py-0.5 text-xs font-bold text-on-surface-variant border border-outline-variant/20">
              {total} total
            </span>
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Gerenciamento completo da base de clientes ativos e inativos.
          </p>
        </div>
        <NovoClienteDrawer />
      </div>

      {/* Search */}
      <Suspense>
        <ClientesSearchBar />
      </Suspense>

      {/* Table */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card shadow-sm">
        {clientes.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">
              {q ? 'Nenhum cliente encontrado.' : 'Nenhum cliente ainda.'}
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
                  <ClienteRow key={c.id} href={`/crm/clientes/${c.id}`}>
                    <td className="px-6 py-3.5">
                      <span className="block text-[14px] font-semibold text-on-surface group-hover:text-primary transition-colors">{c.nome}</span>
                      <span className="block text-xs text-on-surface-variant/80 mt-0.5">{c.email}</span>
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
                  </ClienteRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Suspense>
          <ClientesPaginacao page={page} totalPages={totalPages} total={total} perPage={PER_PAGE} />
        </Suspense>
      )}
    </div>
  )
}
