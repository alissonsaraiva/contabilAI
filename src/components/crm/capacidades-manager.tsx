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
  'Tarefas': 'task_alt', 'Clientes': 'person', 'Funil': 'filter_alt', 'Histórico': 'history',
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

  const categorias = [...new Set(capacidades.map(t => t.categoria))]

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
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
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

      {/* Grid de capacidades */}
      <div className="space-y-4">
        {categorias.map(cat => (
          <div key={cat}>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
                {CATEGORIA_ICON[cat] ?? 'build'}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{cat}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {capacidades.filter(c => c.categoria === cat).map(cap => {
                const off = desabilitadas.has(cap.tool)
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
        ))}
      </div>

      {/* Rodapé salvar */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[12px] text-on-surface-variant/60">
          {desabilitadas.size > 0 ? `${desabilitadas.size} ferramenta(s) desabilitada(s)` : 'Todas as ferramentas habilitadas'}
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
