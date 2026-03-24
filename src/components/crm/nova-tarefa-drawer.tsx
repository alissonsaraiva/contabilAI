'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'

const INPUT = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'
const SELECT = INPUT + ' appearance-none cursor-pointer pr-10'

type Cliente = { id: string; nome: string }

type Props = { clientes: Cliente[] }

const PRIORIDADES = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
]

const INIT = { titulo: '', descricao: '', prioridade: 'media', prazo: '', clienteId: '' }

export function NovaTarefaDrawer({ clientes }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(INIT)
  const [erros, setErros] = useState<Record<string, string>>({})

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    setErros(e => ({ ...e, [field]: '' }))
  }

  function reset() {
    setForm(INIT)
    setErros({})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErros: Record<string, string> = {}
    if (!form.titulo.trim() || form.titulo.length < 3) newErros.titulo = 'Título muito curto (mín. 3 caracteres)'
    if (Object.keys(newErros).length) { setErros(newErros); return }

    setLoading(true)
    try {
      const res = await fetch('/api/tarefas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: form.titulo,
          descricao: form.descricao || undefined,
          prioridade: form.prioridade,
          prazo: form.prazo ? new Date(form.prazo).toISOString() : null,
          clienteId: form.clienteId || null,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Tarefa criada!')
      setOpen(false)
      reset()
      router.refresh()
    } catch {
      toast.error('Erro ao criar tarefa')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">add</span>
        Nova Tarefa
      </button>

      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0 bg-card">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>task_alt</span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-on-surface">Nova Tarefa</h2>
            <p className="text-[12px] text-on-surface-variant">Adicione uma tarefa à fila de trabalho</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 custom-scrollbar">
            {/* Título */}
            <div>
              <label className={LABEL}>
                Título <span className="text-error">*</span>
              </label>
              <input
                className={INPUT}
                placeholder="Ex: Enviar DCTF — JP Almeida"
                value={form.titulo}
                onChange={e => set('titulo', e.target.value)}
                autoFocus
              />
              {erros.titulo && <p className="mt-1.5 text-xs font-medium text-error">{erros.titulo}</p>}
            </div>

            {/* Prioridade + Prazo */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Prioridade</label>
                <div className="relative">
                  <select className={SELECT} value={form.prioridade} onChange={e => set('prioridade', e.target.value)}>
                    {PRIORIDADES.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
                </div>
              </div>
              <div>
                <label className={LABEL}>Prazo</label>
                <input
                  type="date"
                  className={INPUT}
                  value={form.prazo}
                  onChange={e => set('prazo', e.target.value)}
                />
              </div>
            </div>

            {/* Cliente */}
            <div>
              <label className={LABEL}>Cliente (opcional)</label>
              <div className="relative">
                <select className={SELECT} value={form.clienteId} onChange={e => set('clienteId', e.target.value)}>
                  <option value="">— Nenhum cliente —</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
              </div>
            </div>

            {/* Descrição */}
            <div>
              <label className={LABEL}>Descrição (opcional)</label>
              <textarea
                rows={3}
                className="w-full resize-none rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 custom-scrollbar"
                placeholder="Detalhes adicionais sobre a tarefa..."
                value={form.descricao}
                onChange={e => set('descricao', e.target.value)}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-outline-variant/15 px-6 py-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl px-5 py-2.5 text-[13px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {loading
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                : <span className="material-symbols-outlined text-[16px]">add</span>
              }
              Criar Tarefa
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
