'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

type ToolCapacidade = {
  tool: string
  label: string
  descricao: string
  categoria: string
  canais: string[]
}

const TODOS_CANAIS = ['crm', 'whatsapp', 'portal', 'onboarding'] as const
type Canal = typeof TODOS_CANAIS[number]

const CANAL_LABEL: Record<Canal, string> = {
  crm: 'CRM', whatsapp: 'WhatsApp', portal: 'Portal', onboarding: 'Onboarding',
}
const CANAL_COLORS: Record<Canal, string> = {
  crm:        'bg-primary/10 text-primary border-primary/20',
  whatsapp:   'bg-green-status/10 text-green-status border-green-status/20',
  portal:     'bg-tertiary/10 text-tertiary border-tertiary/20',
  onboarding: 'bg-orange-status/10 text-orange-status border-orange-status/20',
}
const CANAL_BADGE: Record<Canal, string> = {
  crm:        'bg-primary/10 text-primary',
  whatsapp:   'bg-green-500/10 text-green-700',
  portal:     'bg-blue-500/10 text-blue-700',
  onboarding: 'bg-orange-500/10 text-orange-700',
}
const CATEGORIA_ICON: Record<string, string> = {
  'Tarefas':  'task_alt',
  'Clientes': 'person',
  'Funil':    'filter_alt',
  'Histórico':'history',
  'Consulta': 'search',
}

type Props = {
  capacidades: ToolCapacidade[]
  desabilitadasIniciais: string[]
  canaisOverrideIniciais: Record<string, string[]>
}

export function CapacidadesManager({ capacidades, desabilitadasIniciais, canaisOverrideIniciais }: Props) {
  const [desabilitadas, setDesabilitadas]   = useState<Set<string>>(new Set(desabilitadasIniciais))
  const [canaisOverride, setCanaisOverride] = useState<Record<string, string[]>>(canaisOverrideIniciais)
  const [editingTool, setEditingTool]       = useState<string | null>(null)
  const [saving, setSaving]                 = useState(false)
  const [filtroCanal, setFiltroCanal]       = useState<Canal | 'todas'>('todas')

  // Filtra tools pelo canal selecionado (considera override)
  const capacidadesFiltradas = filtroCanal === 'todas'
    ? capacidades
    : capacidades.filter(c => (canaisOverride[c.tool] ?? c.canais).includes(filtroCanal))

  const categorias = [...new Set(capacidadesFiltradas.map(t => t.categoria))]

  // Grupos abertos/fechados — todos abertos por padrão
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(new Set())

  function toggleGrupo(cat: string) {
    setGruposAbertos(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  function abrirTodos()  { setGruposAbertos(new Set(categorias)) }
  function fecharTodos() { setGruposAbertos(new Set()) }

  function toggleTool(tool: string) {
    setDesabilitadas(prev => {
      const next = new Set(prev)
      next.has(tool) ? next.delete(tool) : next.add(tool)
      return next
    })
  }

  function toggleCanal(toolName: string, canal: string) {
    const cap = capacidades.find(c => c.tool === toolName)
    const current = canaisOverride[toolName] ?? cap?.canais ?? []
    const next = current.includes(canal) ? current.filter(c => c !== canal) : [...current, canal]
    setCanaisOverride(prev => ({ ...prev, [toolName]: next }))
  }

  async function salvar() {
    setSaving(true)
    try {
      const res = await fetch('/api/agente/tools', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          desabilitadas: [...desabilitadas],
          canaisOverride,
        }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Erro ao salvar')
      }
      setEditingTool(null)
      toast.success('Configurações salvas!')
    } catch (err) {
      toast.error('Não foi possível salvar as configurações. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const editTool = editingTool ? capacidades.find(c => c.tool === editingTool) : null
  const editEfetivos = editTool ? (canaisOverride[editTool.tool] ?? editTool.canais) : []

  return (
    <>
      {/* Modal de edição de canais */}
      {editTool && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
          onClick={() => setEditingTool(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-outline-variant/15 bg-card p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-on-surface">{editTool.label}</h3>
                <p className="text-[12px] text-on-surface-variant/70 mt-0.5">{editTool.descricao}</p>
              </div>
              <button type="button" onClick={() => setEditingTool(null)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/50">Agentes com acesso</p>
            <div className="space-y-2">
              {TODOS_CANAIS.map(canal => {
                const ativo = editEfetivos.includes(canal)
                return (
                  <button key={canal} type="button" onClick={() => toggleCanal(editTool.tool, canal)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl border px-4 py-2.5 text-left transition-colors',
                      ativo ? CANAL_COLORS[canal] + ' border-current/20' : 'border-outline-variant/15 bg-surface-container-low/30 text-on-surface-variant/50 hover:bg-surface-container-low',
                    )}>
                    <span className="text-[13px] font-semibold">{CANAL_LABEL[canal]}</span>
                    <span className={cn('relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors', ativo ? 'bg-current/70' : 'bg-outline-variant/30')}>
                      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition', ativo ? 'translate-x-4' : 'translate-x-0')} />
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingTool(null)}
                className="rounded-xl border border-outline-variant/20 px-4 py-2 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container">
                Cancelar
              </button>
              <button type="button" onClick={salvar} disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtro por canal */}
      <div className="flex flex-wrap items-center gap-1.5 pb-1">
        {(['todas', ...TODOS_CANAIS] as const).map(c => {
          const ativo = filtroCanal === c
          const count = c === 'todas'
            ? capacidades.length
            : capacidades.filter(t => (canaisOverride[t.tool] ?? t.canais).includes(c)).length
          return (
            <button
              key={c}
              type="button"
              onClick={() => setFiltroCanal(c)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors',
                ativo
                  ? c === 'todas'
                    ? 'border-on-surface/20 bg-on-surface text-surface'
                    : CANAL_COLORS[c]
                  : 'border-outline-variant/20 bg-surface-container-low/50 text-on-surface-variant/60 hover:bg-surface-container-low',
              )}
            >
              {c === 'todas' ? 'Todas' : CANAL_LABEL[c]}
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                ativo ? 'bg-white/20' : 'bg-surface-container text-on-surface-variant/50',
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Grid de capacidades */}
      <div className="space-y-1">

        {/* Controles de grupo */}
        <div className="flex items-center justify-end gap-2 pb-1">
          <button type="button" onClick={abrirTodos}
            className="text-[11px] text-on-surface-variant hover:text-on-surface transition-colors">
            Expandir tudo
          </button>
          <span className="text-on-surface-variant/30 text-[11px]">·</span>
          <button type="button" onClick={fecharTodos}
            className="text-[11px] text-on-surface-variant hover:text-on-surface transition-colors">
            Recolher tudo
          </button>
        </div>

        {categorias.map(cat => {
          const aberto      = gruposAbertos.has(cat)
          const toolsCat    = capacidadesFiltradas.filter(c => c.categoria === cat)
          const totalCat    = toolsCat.length
          const desabCat    = toolsCat.filter(c => desabilitadas.has(c.tool)).length

          return (
            <div key={cat} className="rounded-xl border border-outline-variant/15 overflow-hidden">
              {/* Header do grupo — clicável */}
              <button
                type="button"
                onClick={() => toggleGrupo(cat)}
                className="flex w-full items-center gap-2.5 px-4 py-3 bg-surface-container-low/60 hover:bg-surface-container-low transition-colors text-left"
              >
                <span className="material-symbols-outlined text-[15px] text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {CATEGORIA_ICON[cat] ?? 'build'}
                </span>
                <span className="text-[12px] font-bold uppercase tracking-wider text-on-surface-variant flex-1">{cat}</span>
                <span className="text-[11px] text-on-surface-variant/50 tabular-nums">
                  {totalCat} ferramenta{totalCat !== 1 ? 's' : ''}
                  {desabCat > 0 && (
                    <span className="ml-1.5 text-error/70">· {desabCat} desabilitada{desabCat !== 1 ? 's' : ''}</span>
                  )}
                </span>
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50 transition-transform duration-200"
                  style={{ transform: aberto ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  expand_more
                </span>
              </button>

              {/* Conteúdo do grupo */}
              {aberto && (
                <div className="p-3">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {toolsCat.map(cap => {
                      const off      = desabilitadas.has(cap.tool)
                      const efetivos = canaisOverride[cap.tool] ?? cap.canais
                      return (
                        <div key={cap.tool}
                          className={cn(
                            'rounded-xl border p-3 space-y-2 transition-opacity',
                            off ? 'border-outline-variant/10 bg-surface-container/30 opacity-50' : 'border-outline-variant/20 bg-surface-container-low/50',
                          )}>
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[13px] font-semibold text-on-surface leading-tight">{cap.label}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {/* Editar canais */}
                              <button type="button" onClick={() => setEditingTool(cap.tool)}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-on-surface-variant/40 hover:bg-surface-container hover:text-primary transition-colors"
                                title="Editar acesso por agente">
                                <span className="material-symbols-outlined text-[14px]">edit</span>
                              </button>
                              {/* Toggle on/off */}
                              <button type="button" onClick={() => toggleTool(cap.tool)}
                                className={cn(
                                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                                  off ? 'bg-outline-variant/40' : 'bg-primary',
                                )}
                                aria-label={off ? 'Habilitar' : 'Desabilitar'}>
                                <span className={cn(
                                  'inline-block h-4 w-4 transform rounded-full bg-white shadow transition',
                                  off ? 'translate-x-0' : 'translate-x-4',
                                )} />
                              </button>
                            </div>
                          </div>
                          <p className="text-[12px] text-on-surface-variant/80 leading-relaxed">{cap.descricao}</p>
                          <div className="flex flex-wrap gap-1">
                            {TODOS_CANAIS.map(canal => (
                              <span key={canal} className={cn(
                                'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                efetivos.includes(canal) ? CANAL_BADGE[canal] : 'bg-surface-container text-on-surface-variant/30',
                              )}>
                                {CANAL_LABEL[canal]}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Rodapé salvar */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[12px] text-on-surface-variant/60">
          {desabilitadas.size > 0 ? `${desabilitadas.size} ferramenta(s) desabilitada(s) no total` : 'Todas as ferramentas habilitadas'}
        </p>
        <button type="button" onClick={salvar} disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60 min-w-[120px] justify-center">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">save</span>}
          Salvar
        </button>
      </div>
    </>
  )
}
