import { prisma } from '@/lib/prisma'
import { formatCNPJ } from '@/lib/utils'
import Link from 'next/link'
import { Suspense } from 'react'
import { EmpresasSearchBar } from '@/components/crm/empresas-search-bar'
import { EmpresasPaginacao } from '@/components/crm/empresas-paginacao'
import { STATUS_CLIENTE_LABELS, STATUS_CLIENTE_COLORS } from '@/types'

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
      status ? { cliente: { status: status as any } } : {},
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
    <div className="space-y-6 pb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-headline text-[24px] font-semibold tracking-tight text-on-surface">
              Empresas
            </h1>
            <span className="mt-0.5 rounded-full border border-outline-variant/10 bg-surface-container-lowest px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant/70 shadow-sm whitespace-nowrap">
              {total} Total
            </span>
          </div>
          <p className="mt-1.5 text-[13px] font-medium text-on-surface-variant/70">
            Todas as empresas vinculadas à carteira de clientes.
          </p>
        </div>
      </div>

      {/* Search + Filters */}
      <Suspense>
        <EmpresasSearchBar />
      </Suspense>

      {/* Table */}
      {empresas.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/30 shadow-sm text-center">
          <span className="material-symbols-outlined text-[32px] text-on-surface-variant/20">
            {hasFilters ? 'search_off' : 'domain'}
          </span>
          <p className="text-[12px] font-medium text-on-surface-variant/50">
            {hasFilters
              ? 'Nenhuma empresa encontrada para essa busca.'
              : 'Nenhuma empresa cadastrada.'}
          </p>
          {hasFilters && (
            <Link
              href="/crm/empresas"
              className="text-[11px] font-bold uppercase tracking-widest text-primary transition-colors hover:text-primary/80"
            >
              Limpar filtros
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card shadow-sm">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full border-collapse text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-outline-variant/10 bg-surface-container-lowest/40">
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Empresa</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 hidden md:table-cell">CNPJ</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 hidden lg:table-cell">Regime</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 hidden lg:table-cell">Titular</th>
                  <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Sócios</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {empresas.map((e) => (
                  <tr key={e.id} className="group transition-colors duration-200 hover:bg-surface-container-lowest/80">
                    <td className="px-6 py-4">
                      <Link href={`/crm/empresas/${e.id}`} className="block">
                        <span className="block text-[13px] font-medium text-on-surface group-hover:text-primary transition-colors">
                          {e.razaoSocial ?? e.nomeFantasia ?? '(sem nome)'}
                        </span>
                        {e.nomeFantasia && e.razaoSocial && (
                          <span className="block text-[11px] text-on-surface-variant/60 mt-0.5">{e.nomeFantasia}</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <span className="font-mono text-[12px] text-on-surface-variant/60">
                        {e.cnpj ? formatCNPJ(e.cnpj) : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell">
                      {e.regime ? (
                        <span className={`rounded-[4px] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest border border-current/10 ${REGIME_COLORS[e.regime]?.replace('bg-', 'bg-').split(' ')[0]} ${REGIME_COLORS[e.regime]?.split(' ')[1]}`}>
                          {REGIME_LABELS[e.regime] ?? e.regime}
                        </span>
                      ) : (
                        <span className="text-[12px] font-medium text-on-surface-variant/40">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell">
                      {e.cliente ? (
                        <div>
                          <span className="block text-[13px] font-medium text-on-surface">{e.cliente.nome}</span>
                          <span className="block text-[11px] text-on-surface-variant/60 mt-0.5">{e.cliente.email}</span>
                        </div>
                      ) : (
                        <span className="text-[12px] font-medium text-on-surface-variant/40">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-[12px] font-medium text-on-surface-variant/60">{e.socios.length}</span>
                    </td>
                    <td className="px-6 py-4">
                      {e.cliente?.status ? (
                        <span className={`rounded-[4px] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest border border-current/10 ${STATUS_CLIENTE_COLORS[e.cliente.status]?.split(' ').slice(0, 2).join(' ')}`}>
                          {STATUS_CLIENTE_LABELS[e.cliente.status] ?? e.cliente.status}
                        </span>
                      ) : (
                        <span className="text-[12px] font-medium text-on-surface-variant/40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Suspense>
          <EmpresasPaginacao page={page} totalPages={totalPages} total={total} perPage={PER_PAGE} />
        </Suspense>
      )}
    </div>
  )
}
