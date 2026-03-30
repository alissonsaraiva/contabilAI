'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'

const TIPO_OPTIONS = [
  { value: 'informativo', label: 'Informativo' },
  { value: 'alerta',      label: 'Alerta' },
  { value: 'obrigacao',   label: 'Obrigação' },
  { value: 'promocional', label: 'Promoção' },
]

const INPUT  = 'w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-2.5 text-[13px] text-on-surface focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL  = 'block text-[12px] font-semibold text-on-surface-variant mb-1'

export function ComunicadoForm() {
  const router   = useRouter()
  const fileRef  = useRef<HTMLInputElement>(null)
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [anexo, setAnexo]     = useState<File | null>(null)
  const [form, setForm] = useState({
    titulo: '', conteudo: '', tipo: 'informativo',
    publicar: false, enviarEmail: false, expiradoEm: '',
  })

  function set(field: string, value: unknown) { setForm(f => ({ ...f, [field]: value })) }

  function handleAnexo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (file && file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo muito grande. O limite é 10 MB.')
      e.target.value = ''
      return
    }
    setAnexo(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.titulo.trim() || !form.conteudo.trim()) {
      toast.error('Título e conteúdo são obrigatórios')
      return
    }
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('titulo',      form.titulo.trim())
      fd.append('conteudo',    form.conteudo.trim())
      fd.append('tipo',        form.tipo)
      fd.append('publicar',    String(form.publicar))
      fd.append('enviarEmail', String(form.enviarEmail))
      if (form.expiradoEm) fd.append('expiradoEm', form.expiradoEm)
      if (anexo)            fd.append('anexo', anexo)

      const res = await fetch('/api/crm/comunicados', { method: 'POST', body: fd })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Erro desconhecido' }))
        toast.error(error ?? 'Erro ao salvar comunicado')
        return
      }

      const label = form.publicar
        ? (form.enviarEmail ? 'Comunicado publicado e e-mails sendo enviados!' : 'Comunicado publicado!')
        : 'Rascunho salvo!'
      toast.success(label)

      setForm({ titulo: '', conteudo: '', tipo: 'informativo', publicar: false, enviarEmail: false, expiradoEm: '' })
      setAnexo(null)
      if (fileRef.current) fileRef.current.value = ''
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro ao salvar comunicado')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]">add</span>
        Novo comunicado
      </button>
    )
  }

  return (
    <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
      <h3 className="text-[14px] font-semibold text-on-surface mb-4">Novo comunicado</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={LABEL}>Título *</label>
            <input className={INPUT} value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ex: Prazo IRPF 2025" autoFocus />
          </div>
          <div className="col-span-2">
            <label className={LABEL}>Conteúdo *</label>
            <textarea className={INPUT + ' min-h-[80px] resize-y'} rows={3} value={form.conteudo} onChange={e => set('conteudo', e.target.value)} placeholder="Texto completo do comunicado..." />
          </div>
          <div>
            <label className={LABEL}>Tipo</label>
            <select className={INPUT + ' cursor-pointer'} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
              {TIPO_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Expirar em (opcional)</label>
            <input type="date" className={INPUT} value={form.expiradoEm} onChange={e => set('expiradoEm', e.target.value)} />
          </div>

          {/* Anexo */}
          <div className="col-span-2">
            <label className={LABEL}>Anexo (opcional · máx. 10 MB)</label>
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-2.5 text-[13px] text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-[16px]">attach_file</span>
                {anexo ? anexo.name : 'Escolher arquivo'}
                <input ref={fileRef} type="file" className="hidden" onChange={handleAnexo} accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" />
              </label>
              {anexo && (
                <button
                  type="button"
                  onClick={() => { setAnexo(null); if (fileRef.current) fileRef.current.value = '' }}
                  className="text-[12px] text-on-surface-variant/60 hover:text-error transition-colors"
                >
                  Remover
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.publicar}
                onChange={e => { set('publicar', e.target.checked); if (!e.target.checked) set('enviarEmail', false) }}
                className="h-4 w-4 rounded border-outline-variant accent-primary"
              />
              <span className="text-[13px] text-on-surface-variant">Publicar agora (visível no portal)</span>
            </label>
            {form.publicar && (
              <label className="flex items-center gap-2 cursor-pointer ml-0.5">
                <input
                  type="checkbox"
                  checked={form.enviarEmail}
                  onChange={e => set('enviarEmail', e.target.checked)}
                  className="h-4 w-4 rounded border-outline-variant accent-primary"
                />
                <span className="text-[13px] text-on-surface-variant">Enviar por e-mail para todos os clientes</span>
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
              {form.publicar ? (form.enviarEmail ? 'Publicar e enviar e-mails' : 'Publicar') : 'Salvar rascunho'}
            </button>
          </div>
        </div>
      </form>
    </Card>
  )
}
