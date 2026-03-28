'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'

const INPUT = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'
const SELECT = INPUT + ' appearance-none cursor-pointer pr-10'

const TIPOS = [
  { value: 'assistente', label: 'Assistente' },
  { value: 'contador', label: 'Contador' },
  { value: 'admin', label: 'Admin' },
]

const INIT = { nome: '', email: '', tipo: 'assistente' }

type AcessoCriado = {
  nome: string
  email: string
  senha: string
}

function InfoAcesso({ acesso, onClose }: { acesso: AcessoCriado; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false)

  const urlCrm = typeof window !== 'undefined' ? window.location.origin + '/login' : ''

  const mensagemWhatsApp =
    `Olá, *${acesso.nome}*! 👋\n\n` +
    `Seu acesso ao ${process.env.NEXT_PUBLIC_APP_NAME ?? 'sistema'} está pronto:\n\n` +
    `🌐 *Link:* ${urlCrm}\n` +
    `📧 *E-mail:* ${acesso.email}\n` +
    `🔑 *Senha temporária:* \`${acesso.senha}\`\n\n` +
    `⚠️ No primeiro acesso você será solicitado a criar uma nova senha.`

  async function copiarTudo() {
    await navigator.clipboard.writeText(mensagemWhatsApp)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 custom-scrollbar">
        {/* Sucesso */}
        <div className="flex items-center gap-3 rounded-xl border border-green-status/20 bg-green-status/5 px-4 py-3">
          <span className="material-symbols-outlined text-[20px] text-green-status" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          <p className="text-[13px] font-medium text-green-status">Usuário criado com sucesso!</p>
        </div>

        {/* Dados de acesso */}
        <div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/50">Dados de acesso</p>
          <div className="space-y-3 rounded-xl border border-outline-variant/15 bg-surface-container-low p-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50">Nome</p>
              <p className="text-[14px] font-medium text-on-surface">{acesso.nome}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50">E-mail</p>
              <p className="text-[14px] font-medium text-on-surface">{acesso.email}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50">Senha temporária</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-card border border-outline-variant/20 px-3 py-1.5 text-[13px] font-mono text-on-surface">
                  {acesso.senha}
                </code>
              </div>
            </div>
          </div>
        </div>

        {/* Aviso */}
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3">
          <p className="text-[12px] leading-relaxed text-amber-600">
            <span className="font-semibold">Atenção:</span> Salve esses dados agora. A senha temporária não será exibida novamente. No primeiro acesso, o usuário precisará criar uma nova senha.
          </p>
        </div>

        {/* Preview mensagem WhatsApp */}
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/50">Mensagem para enviar</p>
          <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-4">
            <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-on-surface-variant/80">
              {mensagemWhatsApp}
            </pre>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-outline-variant/15 px-6 py-4">
        <button
          type="button"
          onClick={copiarTudo}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-2.5 text-[13px] font-semibold text-on-surface transition-colors hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-[16px]">{copiado ? 'check' : 'content_copy'}</span>
          {copiado ? 'Copiado!' : 'Copiar para WhatsApp'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  )
}

export function NovoUsuarioDrawer() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(INIT)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [acesso, setAcesso] = useState<AcessoCriado | null>(null)

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    setErros(e => ({ ...e, [field]: '' }))
  }

  function reset() { setForm(INIT); setErros({}); setAcesso(null) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErros: Record<string, string> = {}
    if (!form.nome.trim() || form.nome.length < 2) newErros.nome = 'Nome obrigatório'
    if (!form.email.includes('@')) newErros.email = 'E-mail inválido'
    if (Object.keys(newErros).length) { setErros(newErros); return }

    setLoading(true)
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.status === 409) { toast.error('E-mail já cadastrado'); return }
      if (res.status === 403) { toast.error('Apenas administradores podem criar usuários'); return }
      if (!res.ok) throw new Error()
      const data = await res.json()
      setAcesso({ nome: data.nome, email: data.email, senha: data.senhaGerada })
      router.refresh()
    } catch {
      toast.error('Erro ao criar usuário')
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setOpen(false)
    reset()
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) handleClose(); else setOpen(true) }}>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">person_add</span>
        Novo Usuário
      </button>

      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0 bg-card">
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>person_add</span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-on-surface">{acesso ? 'Acesso criado' : 'Novo Usuário'}</h2>
            <p className="text-[12px] text-on-surface-variant">{acesso ? 'Compartilhe os dados de acesso' : 'Crie um acesso ao CRM'}</p>
          </div>
        </div>

        {acesso ? (
          <InfoAcesso acesso={acesso} onClose={handleClose} />
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 custom-scrollbar">

              <div>
                <label className={LABEL}>Nome completo <span className="text-error">*</span></label>
                <input className={INPUT} placeholder="Ex: Ana Paula Lima" value={form.nome} onChange={e => set('nome', e.target.value)} autoFocus />
                {erros.nome && <p className="mt-1.5 text-xs font-medium text-error">{erros.nome}</p>}
              </div>

              <div>
                <label className={LABEL}>E-mail <span className="text-error">*</span></label>
                <input type="email" className={INPUT} placeholder="ana@escritorio.com.br" value={form.email} onChange={e => set('email', e.target.value)} />
                {erros.email && <p className="mt-1.5 text-xs font-medium text-error">{erros.email}</p>}
              </div>

              <div>
                <label className={LABEL}>Tipo de acesso</label>
                <div className="relative">
                  <select className={SELECT} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                    {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
                </div>
                <p className="mt-1.5 text-[12px] text-on-surface-variant/60">
                  {form.tipo === 'admin' && 'Acesso total ao sistema, incluindo usuários e configurações.'}
                  {form.tipo === 'contador' && 'Acesso completo ao CRM: clientes, leads, tarefas e configurações.'}
                  {form.tipo === 'assistente' && 'Acesso limitado às tarefas e leads atribuídos a si.'}
                </p>
              </div>

              <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-4">
                <div className="flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
                  <p className="text-[12px] leading-relaxed text-on-surface-variant/70">
                    Uma senha temporária será gerada automaticamente. O usuário precisará criar uma nova senha no primeiro acesso.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-outline-variant/15 px-6 py-4">
              <button type="button" onClick={handleClose} className="rounded-xl px-5 py-2.5 text-[13px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container">
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
                Criar Usuário
              </button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  )
}
