import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { FEATURE_LABELS } from '@/lib/ai/constants'
import '@/lib/ai/tools'
import { getCapacidades } from '@/lib/ai/tools/registry'
import { LogRow, type LogEntry } from './_log-row'

// ─── Filtros de período ───────────────────────────────────────────────────────

const PERIODO_LABELS: Record<string, string> = {
  '1d': 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  'all': 'Todos',
}

function buildDateFilter(periodo: string): Date | null {
  const now = new Date()
  if (periodo === '1d') { now.setDate(now.getDate() - 1); return now }
  if (periodo === '7d') { now.setDate(now.getDate() - 7); return now }
  if (periodo === '30d') { now.setDate(now.getDate() - 30); return now }
  return null
}

// ─── Stats globais com cache 5min ─────────────────────────────────────────────
// Evita full table scan a cada page load

const getStatsGlobais = unstable_cache(
  async () => {
    const rows = await prisma.$queryRaw<{ sucesso: boolean; total: bigint }[]>`
      SELECT sucesso, COUNT(*) as total FROM agente_acoes GROUP BY sucesso
    `
    let ok = 0, erros = 0
    for (const r of rows) {
      if (r.sucesso) ok = Number(r.total)
      else erros = Number(r.total)
    }
    return { ok, erros }
  },
  ['agente-stats'],
  { revalidate: 300 },
)

// ─── Params ───────────────────────────────────────────────────────────────────

type Props = {
  searchParams: Promise<{
    page?: string
    tool?: string
    solicitante?: string
    sucesso?: string
    periodo?: string
    search?: string
  }>
}

// ─── buildQuery helper ────────────────────────────────────────────────────────

type Filters = {
  tool?: string
  solicitante?: string
  sucesso?: string
  periodo?: string
  search?: string
  page?: string
}

function buildQuery(f: Filters): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined && v !== '' && v !== 'all' && k !== 'page') params.set(k, v)
    if (k === 'page' && v && v !== '1') params.set(k, v)
  }
  return params.toString() ? `?${params.toString()}` : ''
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function LogsPage({ searchParams }: Props) {
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1'))
  const limit = 50
  const skip = (page - 1) * limit

  const filters: Filters = {
    tool: sp.tool || undefined,
    solicitante: sp.solicitante || undefined,
    sucesso: sp.sucesso || undefined,
    periodo: sp.periodo || 'all',
    search: sp.search || undefined,
  }

  const desde = buildDateFilter(filters.periodo ?? 'all')

  const where = {
    ...(filters.tool && { tool: filters.tool }),
    ...(filters.solicitante && { solicitanteAI: filters.solicitante }),
    ...(filters.sucesso !== undefined && filters.sucesso !== '' && { sucesso: filters.sucesso === 'true' }),
    ...(desde && { criadoEm: { gte: desde } }),
  }

  // ── Queries em paralelo ────────────────────────────────────────────────────
  const [acoes, total, stats, capacidades] = await Promise.all([
    prisma.agenteAcao.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip,
      take: limit,
      select: {
        id: true, tool: true, sucesso: true, duracaoMs: true,
        solicitanteAI: true, usuarioNome: true, usuarioTipo: true,
        clienteId: true, leadId: true, criadoEm: true, resultado: true, input: true,
      },
    }),
    prisma.agenteAcao.count({ where }),
    getStatsGlobais(),
    Promise.resolve(getCapacidades()),
  ])

  const totalPages = Math.ceil(total / limit)

  // ── Resolve nomes em batch ─────────────────────────────────────────────────
  const clienteIds = [...new Set(acoes.map(a => a.clienteId).filter(Boolean))] as string[]
  const leadIds = [...new Set(acoes.map(a => a.leadId).filter(Boolean))] as string[]

  const [clientes, leads] = await Promise.all([
    clienteIds.length > 0
      ? prisma.cliente.findMany({
        where: { id: { in: clienteIds } },
        select: { id: true, nome: true, empresa: { select: { razaoSocial: true } } },
      })
      : [],
    leadIds.length > 0
      ? prisma.lead.findMany({
        where: { id: { in: leadIds } },
        select: { id: true, contatoEntrada: true, dadosJson: true },
      })
      : [],
  ])

  const clienteMap = Object.fromEntries(clientes.map(c => [c.id, c.empresa?.razaoSocial ?? c.nome ?? 'Cliente']))
  const leadMap = Object.fromEntries(leads.map(l => {
    const d = (l.dadosJson ?? {}) as Record<string, string>
    return [l.id, d['Nome completo'] ?? d['Razão Social'] ?? l.contatoEntrada ?? 'Lead']
  }))

  const toolLabelMap = Object.fromEntries(capacidades.map(c => [c.tool, c.label]))

  // ── Filtro de busca por contexto (aplicado após resolução de nomes) ─────────
  const acoesVisiveis = filters.search
    ? acoes.filter(a => {
      const ctx = a.clienteId ? clienteMap[a.clienteId] : a.leadId ? leadMap[a.leadId] : ''
      return ctx?.toLowerCase().includes(filters.search!.toLowerCase())
    })
    : acoes

  // ── Monta rows serializáveis para o client component ───────────────────────
  const rows: LogEntry[] = acoesVisiveis.map(a => ({
    id: a.id,
    tool: a.tool,
    toolLabel: toolLabelMap[a.tool] ?? a.tool,
    sucesso: a.sucesso,
    duracaoMs: a.duracaoMs,
    solicitanteAI: a.solicitanteAI,
    usuarioNome: a.usuarioNome,
    usuarioTipo: a.usuarioTipo,
    contexto: a.clienteId ? clienteMap[a.clienteId] : a.leadId ? leadMap[a.leadId] : null,
    input: a.input,
    resultado: a.resultado,
    criadoEm: a.criadoEm.toISOString(),
  }))

  // ── URL de export (passa filtros atuais) ───────────────────────────────────
  const exportParams = new URLSearchParams()
  if (filters.tool) exportParams.set('tool', filters.tool)
  if (filters.solicitante) exportParams.set('solicitante', filters.solicitante)
  if (filters.sucesso) exportParams.set('sucesso', filters.sucesso)
  if (filters.periodo && filters.periodo !== 'all') exportParams.set('periodo', filters.periodo)
  if (filters.search) exportParams.set('search', filters.search)
  const exportUrl = `/api/crm/agente-acoes/export${exportParams.toString() ? `?${exportParams}` : ''}`

  const hasFilters = !!(filters.tool || filters.solicitante || filters.sucesso || (filters.periodo && filters.periodo !== 'all') || filters.search)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-on-surface">Logs de execução</h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Registro de todas as ações executadas pelas IAs
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Stats globais com cache */}
          <div className="flex items-center gap-4 text-sm bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant/50">
            <div className="flex items-center gap-1.5 text-on-surface-variant">
              <span className="material-symbols-outlined text-[15px] text-success" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              <span className="tabular-nums font-medium text-on-surface">{stats.ok.toLocaleString('pt-BR')}</span>
              <span>ok</span>
            </div>
            <div className="flex items-center gap-1.5 text-on-surface-variant">
              <span className="material-symbols-outlined text-[15px] text-error" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
              <span className="tabular-nums font-medium text-on-surface">{stats.erros.toLocaleString('pt-BR')}</span>
              <span>erro{stats.erros !== 1 ? 's' : ''}</span>
            </div>
          </div>
          {/* Export CSV */}
          <a
            href={exportUrl}
            className="flex items-center justify-center sm:justify-start gap-1.5 rounded-lg border border-outline-variant px-3 py-2 text-xs font-medium text-on-surface-variant hover:bg-surface-container transition-colors w-full sm:w-auto"
          >
            <span className="material-symbols-outlined text-[15px]">download</span>
            Exportar CSV
          </a>
        </div>
      </div>

      {/* Filtros */}
      <form method="GET" className="flex flex-wrap gap-3">

        {/* Período */}
        <select
          name="periodo"
          defaultValue={filters.periodo ?? 'all'}
          className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {Object.entries(PERIODO_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        {/* IA / Feature */}
        <select
          name="solicitante"
          defaultValue={filters.solicitante ?? ''}
          className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Todas as IAs</option>
          {Object.entries(FEATURE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        {/* Tool */}
        <select
          name="tool"
          defaultValue={filters.tool ?? ''}
          className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Todas as tools</option>
          {capacidades.map(c => (
            <option key={c.tool} value={c.tool}>{c.label}</option>
          ))}
        </select>

        {/* Resultado */}
        <select
          name="sucesso"
          defaultValue={filters.sucesso ?? ''}
          className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Todos os resultados</option>
          <option value="true">Sucesso</option>
          <option value="false">Falhou</option>
        </select>

        {/* Busca por contexto */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[14px] text-on-surface-variant/40">search</span>
          <input
            name="search"
            type="text"
            defaultValue={filters.search ?? ''}
            placeholder="Buscar cliente ou lead..."
            className="rounded-lg border border-outline-variant bg-surface-container pl-8 pr-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          Filtrar
        </button>

        {hasFilters && (
          <a
            href="/crm/configuracoes/ia/logs"
            className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            Limpar
          </a>
        )}

        <span className="ml-auto self-center text-xs text-on-surface-variant">
          {total.toLocaleString('pt-BR')} registro{total !== 1 ? 's' : ''}
          {hasFilters ? ' (filtrado)' : ''}
        </span>
      </form>

      {/* Tabela */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
            <span className="material-symbols-outlined text-[48px] mb-3 opacity-30">history</span>
            <p className="text-sm">Nenhum log encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low">
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Tool</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Origem</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Operador</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Contexto</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">
                    Input
                    <span className="ml-1 text-[10px] font-normal opacity-50">(clique p/ expandir)</span>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">
                    Resultado
                    <span className="ml-1 text-[10px] font-normal opacity-50">(clique p/ expandir)</span>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Duração</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant whitespace-nowrap">Data / Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {rows.map(row => (
                  <LogRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-on-surface-variant">
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/crm/configuracoes/ia/logs${buildQuery({ ...filters, page: String(page - 1) })}`}
                className="rounded-lg border border-outline-variant px-3 py-1.5 text-on-surface hover:bg-surface-container transition-colors"
              >
                ← Anterior
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/crm/configuracoes/ia/logs${buildQuery({ ...filters, page: String(page + 1) })}`}
                className="rounded-lg border border-outline-variant px-3 py-1.5 text-on-surface hover:bg-surface-container transition-colors"
              >
                Próxima →
              </a>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
