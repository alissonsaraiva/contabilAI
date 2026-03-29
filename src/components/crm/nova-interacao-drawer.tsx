'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'

const INPUT = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'

const TIPOS = [
  { value: 'nota_interna',     label: 'Nota interna',      icon: 'sticky_note_2' },
  { value: 'ligacao',          label: 'Ligação',            icon: 'call' },
  { value: 'documento_enviado',label: 'Documento enviado',  icon: 'upload_file' },
  { value: 'whatsapp_enviado', label: 'WhatsApp',           icon: 'chat' },
]

// Tipos visíveis no portal do cliente (indicação visual no formulário)
const TIPOS_PORTAL = ['documento_enviado']

type Props = { clienteId: string }

export function NovaInteracaoDrawer({ clienteId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ tipo: 'nota_interna', titulo: '', conteudo: '' })
  const [erro, setErro] = useState('')

  function reset() {
    setForm({ tipo: 'nota_interna', titulo: '', conteudo: '' })
    setErro('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (!form.conteudo.trim()) {
      setErro('O conteúdo é obrigatório')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/interacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId,
          tipo: form.tipo,
          titulo: form.titulo.trim() || undefined,
          conteudo: form.conteudo.trim(),
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Interação registrada!')
      setOpen(false)
      reset()
      router.refresh()
    } catch {
      toast.error('Erro ao registrar interação')
    } finally {
      setLoading(false)
    }
  }

  const tipoSelecionado = TIPOS.find(t => t.value === form.tipo)
  const visivelPortal = TIPOS_PORTAL.includes(form.tipo)

  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]">add</span>
        Nova interação
      </button>

      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0 bg-card" showCloseButton={false}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              {tipoSelecionado?.icon ?? 'history'}
            </span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-on-surface">Nova interação</h2>
            <p className="text-[12px] text-on-surface-variant">Registre uma comunicação ou nota</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 custom-scrollbar">

            {/* Tipo */}
            <div>
              <label className={LABEL}>Tipo <span className="text-error">*</span></label>
              <div className="relative">
                <select
                  className={INPUT + ' appearance-none cursor-pointer pr-10'}
                  value={form.tipo}
                  onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                >
                  {TIPOS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">
                  expand_more
                </span>
              </div>
              {visivelPortal && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-primary/70">
                  <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                  Visível no portal do cliente
                </p>
              )}
            </div>

            {/* Título */}
            <div>
              <label className={LABEL}>Título <span className="text-on-surface-variant/40 font-normal">(opcional)</span></label>
              <input
                className={INPUT}
                placeholder={
                  form.tipo === 'documento_enviado' ? 'Ex: DAS de março/2025 enviado' :
                  form.tipo === 'email_enviado'     ? 'Ex: Orientação sobre DASN' :
                  form.tipo === 'ligacao'           ? 'Ex: Retorno sobre abertura de empresa' :
                  'Título da nota...'
                }
                value={form.titulo}
                onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
              />
            </div>

            {/* Conteúdo */}
            <div>
              <label className={LABEL}>Conteúdo <span className="text-error">*</span></label>
              <textarea
                className={INPUT + ' h-36 resize-none py-3'}
                placeholder={
                  form.tipo === 'documento_enviado' ? 'Descreva o documento enviado (ex: guia de pagamento do DAS de março, vencimento 20/03)...' :
                  form.tipo === 'email_enviado'     ? 'Resumo ou conteúdo do e-mail enviado...' :
                  form.tipo === 'ligacao'           ? 'O que foi discutido na ligação...' :
                  form.tipo === 'nota_interna'      ? 'Observações internas (não visíveis ao cliente)...' :
                  form.tipo === 'whatsapp_enviado'  ? 'Resumo da conversa ou mensagem enviada...' :
                  'Descreva a interação...'
                }
                value={form.conteudo}
                onChange={e => setForm(f => ({ ...f, conteudo: e.target.value }))}
                autoFocus
              />
              {erro && <p className="mt-1.5 text-xs font-medium text-error">{erro}</p>}
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
                : <span className="material-symbols-outlined text-[16px]">save</span>
              }
              Salvar
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
