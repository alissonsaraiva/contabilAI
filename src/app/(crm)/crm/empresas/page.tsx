import { prisma } from '@/lib/prisma'
import { formatCNPJ } from '@/lib/utils'
import Link from 'next/link'
import { Suspense } from 'react'
import { EmpresasSearchBar } from '@/components/crm/empresas-search-bar'
import { EmpresasFiltros } from '@/components/crm/empresas-filtros'
import { EmpresasPaginacao } from '@/components/crm/empresas-paginacao'

const PER_PAGE = 15

const REGIME_LABELS: Record<string, string> = {
  MEI: 'MEI',
  SimplesNacional: 'Simples Nacional',
  LucroPresumido: 'Lucro Presumido',
  LucroReal: 'Lucro Real',
  Autonomo: 'Autônomo',
}

const REGIME_COLORS: Record<string, string> = {
  MEI: 'bg-green-status/10 text-green-status',
  SimplesNacional: 'bg-primary/10 text-primary',
  LucroPresumido: 'bg-tertiary/10 text-tertiary',
  LucroReal: 'bg-orange-status/10 text-orange-status',
  Autonomo: 'bg-surface-container text-on-surface-variant',
}

const STATUS_COLORS: Record<string, string> = {
  ativo: 'bg-green-status/10 text-green-status',
  inativo: 'bg-error/10 text-error',
  inadimplente: 'bg-orange-status/10 text-orange-status',
  rescindido: 'bg-surface-container text-on-surface-variant',
  suspenso: 'bg-tertiary/10 text-tertiary',
}

const STATUS_LABELS: Record<string, string> = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  inadimplente: 'Inadimplente',
  rescindido: 'Rescindido',
  suspenso: 'Suspenso',
}

type Props = {
  searchParams: Promise<{ q?: string; page?: string; regime?: string; status?: string }>
}

export default async function EmpresasPage({ searchParams }: Props) {
  const { q = '', page: pageParam, regime, status } = await searchParams
  const page = Math.max(1, Number(pageParam ?? '1'))
  const skip = (page - 1) * PER_PAGE
  const qClean = q.replace(/\D/g, '')

  const where = {
    AND: [
      q
        ? {
          OR: [
            { razaoSocial: { contains: q, mode: 'insensitive' as const } },
            { nomeFantasia: { contains: q, mode: 'insensitive' as const } },
            ...(qClean.length >= 4 ? [{ cnpj: { contains: qClean } }] : []),
            {
              cliente: {
                OR: [
                  { nome: { contains: q, mode: 'insensitive' as const } },
                  { email: { contains: q, mode: 'insensitive' as const } },
                ],
              },
            },
          ],
        }
        : {},
      regime ? { regime: regime as any } : {},
      status ? { status: status as any } : {},
    ],
  }

  const [empresas, total] = await Promise.all([
    prisma.empresa.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip,
      take: PER_PAGE,
      include: {
        cliente: { select: { id: true, nome: true, email: true, planoTipo: true, valorMensal: true, status: true } },
        socios: { select: { id: true } },
      },
    }),
    prisma.empresa.count({ where }),
  ])

  const totalPages = Math.ceil(total / PER_PAGE)
  const hasFilters = q || regime || status

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-2 text-2xl font-semibold tracking-tight text-on-surface">
            Empresas
            <span className="rounded-md bg-surface-container-low px-2 py-0.5 text-xs font-bold text-on-surface-variant border border-outline-variant/20 whitespace-nowrap">
              {total} total
            </span>
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Todas as empresas vinculadas à carteira de clientes.
          </p>
        </div>
      </div>

      {/* Search + Filters */}
      <Suspense>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <EmpresasSearchBar />
          <EmpresasFiltros />
        </div>
      </Suspense>

      {/* Table */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card shadow-sm">
        {empresas.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant/25">
              {hasFilters ? 'search_off' : 'domain'}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">
              {hasFilters ? 'Nenhuma empresa encontrada.' : 'Nenhuma empresa ainda.'}
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full border-collapse text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-outline-variant/15">
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Empresa</th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">CNPJ</th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Regime</th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Titular</th>
                  <th className="px-6 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Sócios</th>
                  <th className="px-6 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15">
                {empresas.map((e) => (
                  <tr key={e.id} className="group hover:bg-surface-container-low/40 transition-colors">
                    <td className="px-6 py-3.5">
                      <Link href={`/crm/empresas/${e.id}`} className="block">
                        <span className="block text-[14px] font-semibold text-on-surface group-hover:text-primary transition-colors">
                          {e.razaoSocial ?? e.nomeFantasia ?? '(sem nome)'}
                        </span>
                        {e.nomeFantasia && e.razaoSocial && (
                          <span className="block text-xs text-on-surface-variant/80 mt-0.5">{e.nomeFantasia}</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="font-mono text-[13px] text-on-surface-variant/90">
                        {e.cnpj ? formatCNPJ(e.cnpj) : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      {e.regime ? (
                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${REGIME_COLORS[e.regime] ?? 'bg-surface-container text-on-surface-variant'}`}>
                          {REGIME_LABELS[e.regime] ?? e.regime}
                        </span>
                      ) : (
                        <span className="text-[13px] text-on-surface-variant/40">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5">
                      {e.cliente ? (
                        <div>
                          <span className="block text-[13px] font-medium text-on-surface">{e.cliente.nome}</span>
                          <span className="block text-xs text-on-surface-variant/70">{e.cliente.email}</span>
                        </div>
                      ) : (
                        <span className="text-[13px] text-on-surface-variant/40">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <span className="text-[13px] font-semibold text-on-surface-variant">{e.socios.length}</span>
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[e.status] ?? 'bg-surface-container text-on-surface-variant'}`}>
                        {STATUS_LABELS[e.status] ?? e.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Suspense>
          <EmpresasPaginacao page={page} totalPages={totalPages} total={total} perPage={PER_PAGE} />
        </Suspense>
      )}
    </div>
  )
}
