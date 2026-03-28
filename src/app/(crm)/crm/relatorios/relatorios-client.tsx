'use client'

import { useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

type Relatorio = {
  id: string
  titulo: string
  conteudo: string
  tipo: string
  sucesso: boolean
  agendamentoId: string | null
  agendamentoDesc: string | null
  criadoPorId: string | null
  criadoPorNome: string | null
  arquivoUrl: string | null
  arquivoNome: string | null
  criadoEm: string
}

type Props = {
  relatorios: Relatorio[]
  total: number
  page: number
  totalPages: number
  anos: number[]
  agendamentos: { id: string; desc: string }[]
  filters: { q: string; tipo: string; sucesso: string; agendamentoId: string; ano: string; mes: string }
}

function formatDataPtBR(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function grupoPorMesAno(relatorios: Relatorio[]) {
  const grupos: { label: string; key: string; items: Relatorio[] }[] = []
  const mapa = new Map<string, Relatorio[]>()
  for (const r of relatorios) {
    const d = new Date(r.criadoEm)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!mapa.has(key)) mapa.set(key, [])
    mapa.get(key)!.push(r)
  }
  for (const [key, items] of mapa.entries()) {
    const [ano, mes] = key.split('-')
    grupos.push({ key, label: `${MESES[parseInt(mes) - 1]} ${ano}`, items })
  }
  return grupos
}

function TipoBadge({ tipo }: { tipo: string }) {
  if (tipo === 'agendado') {
    return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Agendado</span>
  }
  return <span className="rounded-full bg-tertiary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-tertiary">Manual</span>
}

function RelatorioItem({ rel, onExpand, expanded }: { rel: Relatorio; onExpand: () => void; expanded: boolean }) {
  const [deleting, startDelete] = useTransition()
  const router = useRouter()

  async function handleDelete() {
    if (!confirm(`Excluir o relatório "${rel.titulo}"?`)) return
    startDelete(async () => {
      const res = await fetch(`/api/relatorios/${rel.id}`, { method: 'DELETE' })
      if (res.ok) { toast.success('Relatório excluído'); router.refresh() }
      else toast.error('Erro ao excluir')
    })
  }

  return (
    <div className={`border-b border-outline-variant/10 last:border-0 transition-colors ${expanded ? 'bg-surface-container-low/40' : 'hover:bg-surface-container-low/20'}`}>
      {/* Row principal */}
      <div
        className="flex items-start gap-3 px-5 py-4 cursor-pointer"
        onClick={onExpand}
      >
        {/* Ícone status */}
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${rel.sucesso ? 'bg-green-status/10' : 'bg-error/10'}`}>
          <span
            className={`material-symbols-outlined text-[16px] ${rel.sucesso ? 'text-green-status' : 'text-error'}`}
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {rel.sucesso ? 'check_circle' : 'error'}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-semibold text-on-surface">{rel.titulo}</p>
            <TipoBadge tipo={rel.tipo} />
            {!rel.sucesso && (
              <span className="rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-error">Erro</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-on-surface-variant/70">
            <span>{formatDataPtBR(rel.criadoEm)}</span>
            {rel.criadoPorNome && <span>· {rel.criadoPorNome}</span>}
            {rel.agendamentoDesc && rel.tipo === 'agendado' && (
              <span className="flex items-center gap-1">
                ·
                <span className="material-symbols-outlined text-[11px]">schedule</span>
                {rel.agendamentoDesc}
              </span>
            )}
          </div>
          {!expanded && (
            <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-on-surface-variant/60">
              {rel.conteudo.replace(/[#*`>\-]/g, '').substring(0, 200)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          {rel.arquivoUrl && (
            <a
              href={rel.arquivoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/60 hover:bg-surface-container hover:text-primary transition-colors"
              title="Baixar arquivo"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
            </a>
          )}
          <button
            onClick={onExpand}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/60 hover:bg-surface-container transition-colors"
            title={expanded ? 'Recolher' : 'Expandir'}
          >
            <span className="material-symbols-outlined text-[16px]">{expanded ? 'expand_less' : 'expand_more'}</span>
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/40 hover:bg-error/10 hover:text-error transition-colors"
            title="Excluir relatório"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      </div>

      {/* Conteúdo expandido */}
      {expanded && (
        <div className="mx-5 mb-4 rounded-xl border border-outline-variant/15 bg-card p-5">
          <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-on-surface">
            {rel.conteudo}
          </pre>
        </div>
      )}
    </div>
  )
}

export function RelatoriosClient({ relatorios, total, page, totalPages, anos, agendamentos, filters }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Estado local dos filtros (controlado pelo form)
  const [q,             setQ]             = useState(filters.q)
  const [tipo,          setTipo]          = useState(filters.tipo)
  const [sucesso,       setSucesso]       = useState(filters.sucesso)
  const [agendamentoId, setAgendamentoId] = useState(filters.agendamentoId)
  const [ano,           setAno]           = useState(filters.ano)
  const [mes,           setMes]           = useState(filters.mes)

  function buildUrl(overrides: Record<string, string> = {}) {
    const params = new URLSearchParams()
    const vals = { q, tipo, sucesso, agendamentoId, ano, mes, page: '1', ...overrides }
    Object.entries(vals).forEach(([k, v]) => { if (v) params.set(k, v) })
    return `${pathname}?${params.toString()}`
  }

  function applyFilters() {
    router.push(buildUrl())
  }

  function clearFilters() {
    setQ(''); setTipo(''); setSucesso(''); setAgendamentoId(''); setAno(''); setMes('')
    router.push(pathname)
  }

  const hasFilters = !!(q || tipo || sucesso || agendamentoId || ano || mes)
  const grupos = grupoPorMesAno(relatorios)

  const INPUT  = 'h-9 w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-3 text-[13px] text-on-surface focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
  const SELECT = INPUT + ' appearance-none cursor-pointer pr-8'

  return (
    <div className="space-y-5">
      {/* Painel de filtros */}
      <div className="rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
        <div className="border-b border-outline-variant/10 px-5 py-3.5 flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant/60" style={{ fontVariationSettings: "'FILL' 1" }}>filter_alt</span>
          <span className="text-[13px] font-semibold text-on-surface-variant">Filtros</span>
          {hasFilters && (
            <button onClick={clearFilters} className="ml-auto text-[12px] font-semibold text-primary hover:opacity-80">
              Limpar filtros
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-6">
          {/* Busca */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60 mb-1.5">Buscar</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant/40">search</span>
              <input
                className={INPUT + ' pl-8'}
                placeholder="Título, conteúdo, responsável..."
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyFilters()}
              />
            </div>
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60 mb-1.5">Tipo</label>
            <div className="relative">
              <select className={SELECT} value={tipo} onChange={e => setTipo(e.target.value)}>
                <option value="">Todos</option>
                <option value="agendado">Agendados</option>
                <option value="manual">Manuais</option>
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[14px] text-on-surface-variant/40">expand_more</span>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60 mb-1.5">Status</label>
            <div className="relative">
              <select className={SELECT} value={sucesso} onChange={e => setSucesso(e.target.value)}>
                <option value="">Todos</option>
                <option value="true">Sucesso</option>
                <option value="false">Com erro</option>
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[14px] text-on-surface-variant/40">expand_more</span>
            </div>
          </div>

          {/* Ano */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60 mb-1.5">Ano</label>
            <div className="relative">
              <select className={SELECT} value={ano} onChange={e => { setAno(e.target.value); setMes('') }}>
                <option value="">Todos</option>
                {anos.map(a => <option key={a} value={String(a)}>{a}</option>)}
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[14px] text-on-surface-variant/40">expand_more</span>
            </div>
          </div>

          {/* Mês */}
          {ano && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60 mb-1.5">Mês</label>
              <div className="relative">
                <select className={SELECT} value={mes} onChange={e => setMes(e.target.value)}>
                  <option value="">Todos</option>
                  {MESES.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[14px] text-on-surface-variant/40">expand_more</span>
              </div>
            </div>
          )}
        </div>

        {/* Agendamentos */}
        {agendamentos.length > 0 && (
          <div className="border-t border-outline-variant/10 px-5 pb-4 pt-3">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60 mb-2">Filtrar por agendamento</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setAgendamentoId(''); applyFilters() }}
                className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${!agendamentoId ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
              >
                Todos
              </button>
              {agendamentos.map(ag => (
                <button
                  key={ag.id}
                  onClick={() => { setAgendamentoId(ag.id); applyFilters() }}
                  className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${agendamentoId === ag.id ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
                >
                  {ag.desc}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Botão aplicar */}
        <div className="flex items-center justify-between border-t border-outline-variant/10 px-5 py-3">
          <span className="text-[12px] text-on-surface-variant/60">
            {total} resultado{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
          </span>
          <button
            onClick={applyFilters}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">search</span>
            Buscar
          </button>
        </div>
      </div>

      {/* Lista */}
      {relatorios.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/15 bg-card py-16 text-center shadow-sm">
          <span className="material-symbols-outlined text-[44px] text-on-surface-variant/20">bar_chart</span>
          <p className="text-[14px] font-medium text-on-surface-variant/60">
            {hasFilters ? 'Nenhum relatório encontrado com esses filtros.' : 'Nenhum relatório gerado ainda.'}
          </p>
          <p className="text-[12px] text-on-surface-variant/40">
            Peça à IA para "gerar um relatório e publicar no painel" ou aguarde o próximo agendamento.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map(grupo => (
            <div key={grupo.key}>
              {/* Cabeçalho do grupo mês/ano */}
              <div className="mb-3 flex items-center gap-3">
                <span className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/50">{grupo.label}</span>
                <div className="h-px flex-1 bg-outline-variant/15" />
                <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-bold text-on-surface-variant/60">
                  {grupo.items.length}
                </span>
              </div>

              <div className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
                {grupo.items.map(rel => (
                  <RelatorioItem
                    key={rel.id}
                    rel={rel}
                    expanded={expandedId === rel.id}
                    onExpand={() => setExpandedId(expandedId === rel.id ? null : rel.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-on-surface-variant">Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={buildUrl({ page: String(page - 1) })}
                className="rounded-xl border border-outline-variant/30 px-4 py-2 text-[13px] font-medium text-on-surface hover:bg-surface-container transition-colors"
              >
                ← Anterior
              </a>
            )}
            {page < totalPages && (
              <a
                href={buildUrl({ page: String(page + 1) })}
                className="rounded-xl border border-outline-variant/30 px-4 py-2 text-[13px] font-medium text-on-surface hover:bg-surface-container transition-colors"
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
