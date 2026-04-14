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

const TIPOS = [
  { value: 'duvida', label: 'Dúvida' },
  { value: 'solicitacao', label: 'Solicitação' },
  { value: 'reclamacao', label: 'Reclamação' },
  { value: 'documento', label: 'Documento' },
  { value: 'emissao_documento', label: 'Emissão de documento' },
  { value: 'correcao_documento', label: 'Correção de documento' },
  { value: 'solicitacao_documento', label: 'Solicitação de documento' },
  { value: 'tarefa_interna', label: 'Tarefa interna' },
  { value: 'outros', label: 'Outros' },
]

const PRIORIDADES = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
]

const INIT = {
  clienteId: '',
  tipo: 'solicitacao',
  titulo: '',
  descricao: '',
  prioridade: 'media',
  visivelPortal: true,
}

export function NovoChamadoDrawer({ clientes }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(INIT)
  const [erros, setErros] = useState<Record<string, string>>({})

  function set(field: string, value: string | boolean) {
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
    if (!form.clienteId) newErros.clienteId = 'Selecione o cliente para continuar.'
    if (!form.titulo.trim() || form.titulo.length < 3) newErros.titulo = 'Título muito curto — use pelo menos 3 caracteres.'
    if (!form.descricao.trim()) newErros.descricao = 'Preencha a descrição para continuar.'
    if (Object.keys(newErros).length) { setErros(newErros); return }

    setLoading(true)
    try {
      const res = await fetch('/api/crm/chamados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      toast.success('Chamado criado.')
      setOpen(false)
      reset()
      router.refresh()
    } catch {
      toast.error('Não foi possível criar o chamado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <button
        onClick={() => setOpen(true)}
        className="group flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-bold tracking-wide text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow"
      >
        <span className="material-symbols-outlined text-[18px] transition-transform group-hover:scale-110">add</span>
        Novo Chamado
      </button>

      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0 bg-card" showCloseButton={false}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>support_agent</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-on-surface">Novo Chamado</h2>
            <p className="text-[12px] text-on-surface-variant">Aberto pelo operador (telefone / presencial)</p>
          </div>
          <button
            type="button"
            onClick={() => { setOpen(false); reset() }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 custom-scrollbar">

            {/* Cliente */}
            <div>
              <label className={LABEL}>
                Cliente <span className="text-error">*</span>
              </label>
              <div className="relative">
                <select
                  className={SELECT}
                  value={form.clienteId}
                  onChange={e => set('clienteId', e.target.value)}
                >
                  <option value="">— Selecione o cliente —</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
              </div>
              {erros.clienteId && <p className="mt-1.5 text-xs font-medium text-error">{erros.clienteId}</p>}
            </div>

            {/* Tipo + Prioridade */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Tipo</label>
                <div className="relative">
                  <select className={SELECT} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                    {TIPOS.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
                </div>
              </div>
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
            </div>

            {/* Título */}
            <div>
              <label className={LABEL}>
                Título <span className="text-error">*</span>
              </label>
              <input
                className={INPUT}
                placeholder="Ex: Enviar guia DAS de março"
                value={form.titulo}
                onChange={e => set('titulo', e.target.value)}
                autoFocus
              />
              {erros.titulo && <p className="mt-1.5 text-xs font-medium text-error">{erros.titulo}</p>}
            </div>

            {/* Descrição */}
            <div>
              <label className={LABEL}>
                Descrição <span className="text-error">*</span>
              </label>
              <textarea
                rows={4}
                className="w-full resize-none rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 custom-scrollbar"
                placeholder="Descreva o que o cliente precisa..."
                value={form.descricao}
                onChange={e => set('descricao', e.target.value)}
              />
              {erros.descricao && <p className="mt-1.5 text-xs font-medium text-error">{erros.descricao}</p>}
            </div>

            {/* Visível no portal */}
            <div className="flex items-center justify-between rounded-xl border border-outline-variant/15 bg-surface-container-low/50 px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold text-on-surface">Visível no portal</p>
                <p className="text-[11px] text-on-surface-variant/60">O cliente poderá acompanhar este chamado</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.visivelPortal}
                onClick={() => set('visivelPortal', !form.visivelPortal)}
                className={`relative h-6 w-11 rounded-full transition-colors ${form.visivelPortal ? 'bg-primary' : 'bg-outline-variant/40'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${form.visivelPortal ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 border-t border-outline-variant/15 px-6 py-4">
            <button
              type="button"
              onClick={() => { setOpen(false); reset() }}
              className="flex-1 h-11 rounded-xl border border-outline-variant/30 text-[14px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 h-11 rounded-xl bg-primary text-[14px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading && <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>}
              {loading ? 'Criando...' : 'Criar chamado'}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
