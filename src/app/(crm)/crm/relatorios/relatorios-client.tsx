'use client'

import { useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RelatorioRenderer } from '@/components/relatorio-renderer'
import { parseRelatorioJSON, relatorioJSONPreview } from '@/lib/relatorio-schema'

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

type AgendamentoAtivo = {
  id: string
  descricao: string
  cron: string
  ativo: boolean
  ultimoDisparo: string | null
  proximoDisparo: string | null
  totalRelatorios: number
}

type Props = {
  relatorios: Relatorio[]
  total: number
  page: number
  totalPages: number
  anos: number[]
  agendamentos: { id: string; desc: string }[]
  agendamentosAtivos: AgendamentoAtivo[]
  filters: { q: string; tipo: string; sucesso: string; agendamentoId: string; ano: string; mes: string }
}

function formatDataPtBR(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDataCurta(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
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
    const [ano, mes] = key.split('-') as [string, string]
    grupos.push({ key, label: `${MESES[parseInt(mes) - 1]!} ${ano}`, items })
  }
  return grupos
}

function TipoBadge({ tipo }: { tipo: string }) {
  if (tipo === 'agendado') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
        <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>schedule</span>
        Agendado
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-tertiary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-tertiary">
      <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
      Manual
    </span>
  )
}

// ─── Card de Agendamento Ativo ────────────────────────────────────────────────
function AgendamentoCard({ ag }: { ag: AgendamentoAtivo }) {
  return (
    <div className={`relative flex min-w-[220px] flex-col gap-3 rounded-2xl border p-4 transition-colors ${
      ag.ativo
        ? 'border-primary/20 bg-primary/5'
        : 'border-outline-variant/15 bg-surface-container-low/60 opacity-60'
    }`}>
      {/* Status pill */}
      <div className="flex items-start justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          ag.ativo ? 'bg-green-status/10 text-green-status' : 'bg-outline-variant/20 text-on-surface-variant/60'
        }`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${ag.ativo ? 'bg-green-status' : 'bg-outline-variant/60'}`} />
          {ag.ativo ? 'Ativo' : 'Inativo'}
        </span>
        <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-bold text-on-surface-variant/60">
          {ag.totalRelatorios} relatório{ag.totalRelatorios !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Descrição */}
      <div>
        <span className="material-symbols-outlined text-[18px] text-primary/70 mb-1" style={{ fontVariationSettings: "'FILL' 1" }}>
          calendar_month
        </span>
        <p className="text-[13px] font-semibold leading-snug text-on-surface line-clamp-2">{ag.descricao}</p>
      </div>

      {/* Próximo / Último disparo */}
      <div className="space-y-1 text-[11px] text-on-surface-variant/70">
        {ag.proximoDisparo && (
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[12px] text-primary/60">arrow_forward</span>
            <span>Próximo: <span className="font-semibold text-on-surface">{formatDataCurta(ag.proximoDisparo)}</span></span>
          </div>
        )}
        {ag.ultimoDisparo ? (
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[12px] text-on-surface-variant/40">history</span>
            <span>Último: <span className="font-medium">{formatDataCurta(ag.ultimoDisparo)}</span></span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[12px] text-on-surface-variant/40">hourglass_empty</span>
            <span className="italic text-on-surface-variant/50">Nunca executado</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Card de Relatório ────────────────────────────────────────────────────────
function RelatorioCard({ rel, expanded, onExpand }: { rel: Relatorio; expanded: boolean; onExpand: () => void }) {
  const [deleting, startDelete]     = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const router = useRouter()

  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportingXls, setExportingXls] = useState(false)

  async function handleExport(formato: 'pdf' | 'xls') {
    const setLoading = formato === 'pdf' ? setExportingPdf : setExportingXls
    setLoading(true)
    try {
      const res = await fetch(`/api/relatorios/${rel.id}/exportar?formato=${formato}`)
      if (!res.ok) { toast.error('Não foi possível gerar a exportação. Tente novamente.'); return }
      const blob = await res.blob()
      const ext  = formato === 'pdf' ? 'pdf' : 'xlsx'
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `${rel.titulo}.${ext}`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Não foi possível exportar o relatório. Tente novamente.') }
    finally { setLoading(false) }
  }

  function handleDelete() {
    startDelete(async () => {
      const res = await fetch(`/api/relatorios/${rel.id}`, { method: 'DELETE' })
      if (res.ok) { toast.success('Relatório excluído.'); router.refresh() }
      else toast.error('Não foi possível excluir o relatório. Tente novamente.')
    })
  }

  const borderColor = rel.tipo === 'agendado' ? 'border-l-primary' : 'border-l-tertiary'
  const iconName    = rel.tipo === 'agendado' ? 'calendar_month' : 'smart_toy'
  const iconBg      = rel.tipo === 'agendado' ? 'bg-primary/10 text-primary' : 'bg-tertiary/10 text-tertiary'

  return (
    <>
    <ConfirmDialog
      open={confirmOpen}
      onClose={() => setConfirmOpen(false)}
      onConfirm={() => { setConfirmOpen(false); handleDelete() }}
      title="Excluir relatório?"
      description={`"${rel.titulo}" será excluído permanentemente.`}
      confirmLabel="Excluir"
      loading={deleting}
    />
    <div className={`border-b border-outline-variant/10 last:border-0 border-l-[3px] ${borderColor} transition-colors ${expanded ? 'bg-surface-container-low/30' : 'hover:bg-surface-container-low/15'}`}>
      <div className="flex items-start gap-3 px-5 py-4 cursor-pointer" onClick={onExpand}>
        {/* Ícone tipo */}
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          <span className="material-symbols-outlined text-[17px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            {iconName}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          {/* Título + badges */}
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-semibold text-on-surface">{rel.titulo}</p>
            <TipoBadge tipo={rel.tipo} />
            {!rel.sucesso && (
              <span className="inline-flex items-center gap-1 rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-error">
                <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
                Erro
              </span>
            )}
          </div>

          {/* Preview do conteúdo */}
          {!expanded && (
            <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-on-surface-variant/60">
              {(() => {
                const parsed = parseRelatorioJSON(rel.conteudo)
                return parsed ? relatorioJSONPreview(parsed) : rel.conteudo.replace(/[#*`>\-_\[\]]/g, '').substring(0, 220)
              })()}
            </p>
          )}

          {/* Meta */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-on-surface-variant/55">
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
        </div>

        {/* Ações */}
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
            title={expanded ? 'Recolher' : 'Ver conteúdo completo'}
          >
            <span className="material-symbols-outlined text-[16px]">{expanded ? 'expand_less' : 'expand_more'}</span>
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
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
        <div className="mx-5 mb-5 space-y-4">
          {/* Botões de export */}
          {(() => {
            const parsed = parseRelatorioJSON(rel.conteudo)
            if (!parsed) return null
            return (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExport('pdf')}
                  disabled={exportingPdf}
                  className="flex items-center gap-1.5 rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-1.5 text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
                  {exportingPdf ? 'Gerando...' : 'Exportar PDF'}
                </button>
                <button
                  onClick={() => handleExport('xls')}
                  disabled={exportingXls}
                  className="flex items-center gap-1.5 rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-1.5 text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[14px]">table_chart</span>
                  {exportingXls ? 'Gerando...' : 'Exportar XLS'}
                </button>
              </div>
            )
          })()}

          {/* Conteúdo renderizado */}
          <div className="rounded-xl border border-outline-variant/15 bg-card p-5">
            {(() => {
              const parsed = parseRelatorioJSON(rel.conteudo)
              if (parsed) return <RelatorioRenderer rel={parsed} />
              return (
                <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-on-surface">
                  {rel.conteudo}
                </pre>
              )
            })()}
          </div>
        </div>
      )}
    </div>
    </>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function RelatoriosClient({
  relatorios, total, page, totalPages, anos, agendamentos, agendamentosAtivos, filters,
}: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const [expandedId, setExpandedId] = useState<string | null>(null)

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

  function applyFilters(overrides: Record<string, string> = {}) {
    router.push(buildUrl(overrides))
  }

  function setTab(t: string) {
    setTipo(t)
    router.push(buildUrl({ tipo: t, page: '1' }))
  }

  function clearFilters() {
    setQ(''); setSucesso(''); setAgendamentoId(''); setAno(''); setMes('')
    router.push(buildUrl({ q: '', sucesso: '', agendamentoId: '', ano: '', mes: '', page: '1' }))
  }

  const hasExtraFilters = !!(q || sucesso || agendamentoId || ano || mes)
  const grupos = grupoPorMesAno(relatorios)
  const mostrarAgendamentos = agendamentosAtivos.length > 0

  const INPUT  = 'h-9 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-3 text-[13px] text-on-surface focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
  const SELECT = INPUT + ' appearance-none cursor-pointer pr-8'

  return (
    <div className="space-y-5">

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 rounded-2xl border border-outline-variant/15 bg-card p-1.5 shadow-sm">
        {[
          { value: '',         label: 'Todos',     icon: 'list' },
          { value: 'agendado', label: 'Agendados', icon: 'calendar_month' },
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => setTab(tab.value)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold transition-all ${
              tipo === tab.value
                ? 'bg-primary text-white shadow-sm'
                : 'text-on-surface-variant/70 hover:bg-surface-container hover:text-on-surface'
            }`}
          >
            <span
              className="material-symbols-outlined text-[15px]"
              style={{ fontVariationSettings: tipo === tab.value ? "'FILL' 1" : "'FILL' 0" }}
            >
              {tab.icon}
            </span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Agendamentos Ativos ────────────────────────────────────── */}
      {mostrarAgendamentos && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/50">
              Agendamentos configurados
            </span>
            <div className="h-px flex-1 bg-outline-variant/15" />
            <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-bold text-on-surface-variant/60">
              {agendamentosAtivos.length}
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {agendamentosAtivos.map(ag => (
              <AgendamentoCard key={ag.id} ag={ag} />
            ))}
          </div>
        </div>
      )}

      {/* ── Filtros inline ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
        <div className="flex flex-wrap items-end gap-3 p-4">
          {/* Busca */}
          <div className="min-w-[200px] flex-1">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/55 mb-1.5">Buscar</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-on-surface-variant/40">search</span>
              <input
                className={INPUT + ' w-full pl-8'}
                placeholder="Título, conteúdo, responsável..."
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyFilters()}
              />
            </div>
          </div>

          {/* Ano */}
          <div className="w-28">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/55 mb-1.5">Ano</label>
            <div className="relative">
              <select className={SELECT + ' w-full'} value={ano} onChange={e => { setAno(e.target.value); setMes('') }}>
                <option value="">Todos</option>
                {anos.map(a => <option key={a} value={String(a)}>{a}</option>)}
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[14px] text-on-surface-variant/40">expand_more</span>
            </div>
          </div>

          {/* Mês */}
          {ano && (
            <div className="w-32">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/55 mb-1.5">Mês</label>
              <div className="relative">
                <select className={SELECT + ' w-full'} value={mes} onChange={e => setMes(e.target.value)}>
                  <option value="">Todos</option>
                  {MESES.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[14px] text-on-surface-variant/40">expand_more</span>
              </div>
            </div>
          )}

          {/* Status pills */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/55 mb-1.5">Status</label>
            <div className="flex h-9 items-center gap-1 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-1.5">
              {[
                { value: '',      label: 'Todos'  },
                { value: 'true',  label: 'Sucesso' },
                { value: 'false', label: 'Erro'   },
              ].map(s => (
                <button
                  key={s.value}
                  onClick={() => { setSucesso(s.value); applyFilters({ sucesso: s.value }) }}
                  className={`rounded-[8px] px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                    sucesso === s.value
                      ? s.value === 'false'
                        ? 'bg-error text-white'
                        : 'bg-primary text-white'
                      : 'text-on-surface-variant/70 hover:bg-surface-container'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Botão aplicar */}
          <button
            onClick={() => applyFilters()}
            className="flex h-9 items-center gap-2 rounded-[10px] bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">search</span>
            Buscar
          </button>

          {hasExtraFilters && (
            <button
              onClick={clearFilters}
              className="flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-semibold text-on-surface-variant/70 hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">close</span>
              Limpar
            </button>
          )}
        </div>

        {/* Chips de agendamentos */}
        {agendamentos.length > 0 && (
          <div className="border-t border-outline-variant/10 px-4 pb-3 pt-2.5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/50">Filtrar por agendamento</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => { setAgendamentoId(''); applyFilters({ agendamentoId: '' }) }}
                className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${!agendamentoId ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
              >
                Todos
              </button>
              {agendamentos.map(ag => (
                <button
                  key={ag.id}
                  onClick={() => { setAgendamentoId(ag.id); applyFilters({ agendamentoId: ag.id }) }}
                  className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${agendamentoId === ag.id ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
                >
                  {ag.desc}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Contador de resultados */}
        <div className="border-t border-outline-variant/10 px-4 py-2.5">
          <span className="text-[12px] text-on-surface-variant/60">
            {total} resultado{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ── Lista de relatórios ────────────────────────────────────── */}
      {relatorios.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-outline-variant/15 bg-card py-16 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <span className="material-symbols-outlined text-[32px] text-primary/50" style={{ fontVariationSettings: "'FILL' 1" }}>
              insights
            </span>
          </div>
          <div>
            <p className="text-[15px] font-semibold text-on-surface-variant/70">
              {hasExtraFilters ? 'Nenhum relatório com esses filtros.' : 'Nenhum relatório gerado ainda.'}
            </p>
            <p className="mt-1 text-[12px] text-on-surface-variant/40">
              Peça à IA: "gerar um relatório e publicar no painel"
            </p>
          </div>
          {!hasExtraFilters && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open-assistente'))}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-primary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
              Gerar relatório agora
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map(grupo => (
            <div key={grupo.key}>
              <div className="mb-3 flex items-center gap-3">
                <span className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/50">{grupo.label}</span>
                <div className="h-px flex-1 bg-outline-variant/15" />
                <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-bold text-on-surface-variant/60">
                  {grupo.items.length}
                </span>
              </div>
              <div className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
                {grupo.items.map(rel => (
                  <RelatorioCard
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

      {/* ── Paginação ─────────────────────────────────────────────── */}
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
