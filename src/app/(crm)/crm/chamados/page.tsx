import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { unaccentSearch } from '@/lib/search'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Suspense } from 'react'
import { NovoChamadoDrawer } from '@/components/crm/novo-chamado-drawer'
import { ChamadosSearchBar } from '@/components/crm/chamados-search-bar'
import { ChamadosPaginacao } from '@/components/crm/chamados-paginacao'

const PER_PAGE = 30

type Props = {
  searchParams: Promise<{
    page?: string
    q?: string
    status?: string
    tipo?: string
    prioridade?: string
  }>
}

const STATUS_CHAMADO: Record<string, { label: string; color: string; icon: string }> = {
  aberta: { label: 'Aberta', color: 'text-blue-600 bg-blue-500/10', icon: 'radio_button_unchecked' },
  em_andamento: { label: 'Em andamento', color: 'text-primary bg-primary/10', icon: 'autorenew' },
  aguardando_cliente: { label: 'Aguardando', color: 'text-yellow-600 bg-yellow-500/10', icon: 'pending' },
  resolvida: { label: 'Resolvida', color: 'text-green-status bg-green-status/10', icon: 'task_alt' },
  cancelada: { label: 'Cancelada', color: 'text-on-surface-variant/50 bg-surface-container', icon: 'cancel' },
}

const TIPO_CHAMADO: Record<string, string> = {
  duvida: 'Dúvida', solicitacao: 'Solicitação', reclamacao: 'Reclamação',
  documento: 'Documento', emissao_documento: 'Emissão', correcao_documento: 'Correção',
  solicitacao_documento: 'Solicitar doc.', tarefa_interna: 'Interna', outros: 'Outros',
}

const PRIORIDADE: Record<string, string> = {
  baixa: 'text-on-surface-variant/50', media: 'text-blue-600', alta: 'text-yellow-600', urgente: 'text-error',
}

function StarsInline({ nota }: { nota: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          className={`material-symbols-outlined text-[10px] ${i <= nota ? 'text-amber-400' : 'text-on-surface-variant/20'}`}
          style={{ fontVariationSettings: i <= nota ? "'FILL' 1" : "'FILL' 0" }}
        >
          star
        </span>
      ))}
    </span>
  )
}

export default async function CrmChamadosPage({ searchParams }: Props) {
  const session = await auth()
  if (!session) redirect('/crm/login')

  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1'))
  const q = (sp.q ?? '').trim()
  const status = sp.status as string | undefined
  const tipo = sp.tipo as string | undefined
  const prioridade = sp.prioridade as string | undefined
  const skip = (page - 1) * PER_PAGE

  // ── Cláusula de busca textual ──────────────────────────────────────────────
  // Se o termo começa com # ou é puramente numérico → busca por numero exato
  // Caso contrário → OR em título, cliente.nome, empresa.razaoSocial/nomeFantasia
  let searchWhere: any = {}
  if (q) {
    const numeroMatch = q.replace(/^#/, '').trim()
    const isNumero = /^\d+$/.test(numeroMatch)

    if (isNumero) {
      searchWhere = { numero: parseInt(numeroMatch, 10) }
    } else {
      const ids = await unaccentSearch({
        sql: `
          SELECT DISTINCT os.id FROM ordens_servico os
          LEFT JOIN clientes c ON c.id = os."clienteId"
          LEFT JOIN empresas e ON e.id = os."empresaId"
          WHERE (
            f_unaccent(os.titulo) ILIKE f_unaccent($1)
            OR f_unaccent(c.nome) ILIKE f_unaccent($1)
            OR f_unaccent(e."razaoSocial") ILIKE f_unaccent($1)
            OR f_unaccent(e."nomeFantasia") ILIKE f_unaccent($1)
          )
        `,
        term: q,
      })
      searchWhere = { id: { in: ids } }
    }
  }

  const where: any = {
    AND: [
      searchWhere,
      status ? { status } : {},
      tipo ? { tipo } : {},
      prioridade ? { prioridade } : {},
    ],
  }

  const [ordens, total, counts, clientes, avalStats, avalDist] = await Promise.all([
    prisma.chamado.findMany({
      where,
      orderBy: [{ prioridade: 'desc' }, { criadoEm: 'desc' }],
      skip,
      take: PER_PAGE,
      include: {
        cliente: { select: { nome: true } },
        empresa: { select: { razaoSocial: true, nomeFantasia: true } },
      },
    }),
    prisma.chamado.count({ where }),
    // Contagens de status sempre sem filtros de busca (para os badges do search bar)
    prisma.chamado.groupBy({ by: ['status'], _count: { status: true } }),
    prisma.cliente.findMany({
      where: { status: 'ativo' },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    }),
    prisma.chamado.aggregate({
      where: { avaliacaoNota: { not: null } },
      _avg: { avaliacaoNota: true },
      _count: { id: true },
    }),
    prisma.chamado.groupBy({
      by: ['avaliacaoNota'],
      where: { avaliacaoNota: { not: null } },
      _count: { id: true },
      orderBy: { avaliacaoNota: 'desc' },
    }),
  ])

  const totalPages = Math.ceil(total / PER_PAGE)
  const mediaAvaliacao = avalStats._avg.avaliacaoNota
  const totalAvaliados = avalStats._count.id
  const totalResolvidas = counts.find(c => c.status === 'resolvida')?._count.status ?? 0
  const distMap = Object.fromEntries(avalDist.map(d => [d.avaliacaoNota ?? 0, d._count.id]))
  const hasFilters = !!(q || status || tipo || prioridade)

  return (
    <div className="space-y-6 pb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-headline text-[24px] font-semibold tracking-tight text-on-surface">
              Chamados
            </h1>
            <span className="mt-0.5 rounded-full border border-outline-variant/10 bg-surface-container-lowest px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant/70 shadow-sm whitespace-nowrap">
              {total} Total
            </span>
          </div>
          <p className="mt-1.5 text-[13px] font-medium text-on-surface-variant/70">
            Solicitações abertas pelos clientes via portal.
          </p>
        </div>
        <NovoChamadoDrawer clientes={clientes} />
      </div>

      {/* Painel de avaliações */}
      <div className="rounded-[20px] border border-outline-variant/15 bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-8">

          {/* Left Block: Star and Media */}
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-50">
              <span className="material-symbols-outlined text-[24px] text-amber-400" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50 mb-0.5">Média de avaliação</p>
              <p className="text-[22px] font-bold text-on-surface leading-none flex items-baseline">
                {mediaAvaliacao != null ? mediaAvaliacao.toFixed(1) : '0.0'}
                <span className="text-[13px] font-medium text-on-surface-variant/40 ml-1">/ 5</span>
              </p>
            </div>
          </div>

          {/* Center Block: Bar chart */}
          <div className="flex items-end gap-1.5 ml-4">
            {[5, 4, 3, 2, 1].map(n => {
              const count = distMap[n] ?? 0
              const pct = totalAvaliados > 0 ? Math.round((count / totalAvaliados) * 100) : 0
              const hasVotes = count > 0

              return (
                <div key={n} title={`${n}★: ${count}`} className="flex flex-col items-center gap-1 w-6">
                  <span className="text-[10px] font-medium text-on-surface-variant/40 h-3 flex items-center justify-center">
                    {hasVotes ? count : ''}
                  </span>
                  <div className="relative w-[14px] h-[34px] rounded-full bg-surface-container overflow-hidden">
                    <div
                      className="absolute bottom-0 w-full rounded-full bg-amber-400 transition-all duration-500"
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-medium text-on-surface-variant/40 mt-0.5">{n}★</span>
                </div>
              )
            })}
          </div>

          {/* Right Block: Stats */}
          <div className="ml-auto text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50 mb-0.5">Avaliados</p>
            <p className="text-[20px] font-bold text-on-surface leading-none flex items-baseline justify-end">
              {totalAvaliados}
              <span className="text-[13px] font-medium text-on-surface-variant/40 ml-0.5">/ {totalResolvidas}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Barra de busca e filtros */}
      <Suspense>
        <ChamadosSearchBar />
      </Suspense>

      {/* Resultado vazio */}
      {ordens.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/30 shadow-sm text-center">
          <span className="material-symbols-outlined text-[32px] text-on-surface-variant/20">
            {hasFilters ? 'search_off' : 'inbox'}
          </span>
          <p className="text-[12px] font-medium text-on-surface-variant/50">
            {hasFilters
              ? 'Nenhum chamado encontrado para essa busca.'
              : 'Nenhum chamado cadastrado.'}
          </p>
          {hasFilters && (
            <Link
              href="/crm/chamados"
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
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 w-[60px]">#</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Chamado</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 hidden md:table-cell">Cliente / Empresa</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 hidden md:table-cell">Tipo</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Status</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 hidden lg:table-cell">Data</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {ordens.map(o => {
                  const s = STATUS_CHAMADO[o.status] ?? STATUS_CHAMADO['aberta']!
                  const nomeEmpresa = o.empresa?.razaoSocial ?? o.empresa?.nomeFantasia ?? ''
                  const prioClass = PRIORIDADE[o.prioridade] ?? 'text-on-surface-variant/50'
                  return (
                    <tr key={o.id} className="group transition-colors duration-200 hover:bg-surface-container-lowest/80">
                      <td className="px-6 py-4 text-[12px] font-mono text-on-surface-variant/50 tabular-nums">
                        #{o.numero}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className={`material-symbols-outlined text-[10px] shrink-0 ${prioClass}`} style={{ fontVariationSettings: "'FILL' 1" }}>circle</span>
                          <p className="text-[13px] font-medium text-on-surface truncate max-w-[200px]">{o.titulo}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <p className="text-[13px] text-on-surface">{o.cliente.nome}</p>
                        {nomeEmpresa && <p className="text-[11px] text-on-surface-variant/60 mt-0.5">{nomeEmpresa}</p>}
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <span className="text-[12px] font-medium text-on-surface-variant">{TIPO_CHAMADO[o.tipo] ?? o.tipo}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`rounded-[4px] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest border border-current/10 ${s.color.replace('bg-', 'bg-').split(' ')[0]!} ${s.color.split(' ')[1]!}`}>
                          {s.label}
                        </span>
                        {o.status === 'resolvida' && o.avaliacaoNota != null && (
                          <div className="mt-1"><StarsInline nota={o.avaliacaoNota} /></div>
                        )}
                      </td>
                      <td className="px-6 py-4 hidden lg:table-cell">
                        <span className="text-[12px] font-medium text-on-surface-variant/60">
                          {new Date(o.criadoEm).toLocaleDateString('pt-BR')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/crm/chamados/${o.id}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant/40 transition-colors hover:bg-surface-container hover:text-primary"
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

      {/* Paginação */}
      {totalPages > 1 && (
        <Suspense>
          <ChamadosPaginacao
            page={page}
            totalPages={totalPages}
            total={total}
            perPage={PER_PAGE}
          />
        </Suspense>
      )}

    </div>
  )
}
