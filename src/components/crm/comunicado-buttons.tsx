'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

async function patchComunicado(id: string, data: object) {
  const res = await fetch(`/api/crm/comunicados/${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  })
  if (!res.ok) throw new Error()
  return res.json()
}

type StatusFiltro = 'ativo' | 'inadimplente' | 'suspenso'

const STATUS_OPTS: { value: StatusFiltro; label: string; desc: string }[] = [
  { value: 'ativo',        label: 'Ativos',        desc: 'Clientes com contrato ativo' },
  { value: 'inadimplente', label: 'Inadimplentes',  desc: 'Com pendência financeira' },
  { value: 'suspenso',     label: 'Suspensos',      desc: 'Serviço temporariamente suspenso' },
]

export function ComunicadoPublishButton({ id }: { id: string }) {
  const router  = useRouter()
  const [open, setOpen]       = useState(false)
  const [email, setEmail]     = useState(true)
  const [status, setStatus]   = useState<StatusFiltro[]>(['ativo', 'inadimplente'])
  const [loading, setLoading] = useState(false)

  function toggleStatus(s: StatusFiltro) {
    setStatus(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    )
  }

  async function handlePublish() {
    setLoading(true)
    try {
      const data = await patchComunicado(id, {
        publicar:    true,
        enviarEmail: email,
        statusEmail: email ? status : undefined,
      })
      if (data.emailDisparado) {
        toast.success('Comunicado publicado e e-mails sendo enviados!')
      } else {
        toast.success('Comunicado publicado!')
      }
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro ao publicar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors"
      >
        Publicar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
            <h3 className="text-[16px] font-semibold text-on-surface">Publicar comunicado</h3>
            <p className="mt-1 text-[13px] text-on-surface-variant">
              O comunicado ficará visível no portal de todos os clientes.
            </p>

            {/* Toggle enviar email */}
            <button
              type="button"
              onClick={() => setEmail(v => !v)}
              className={`mt-4 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                email
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-outline-variant/25 bg-surface-container'
              }`}
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${email ? 'bg-primary/15' : 'bg-slate-100'}`}>
                <span className={`material-symbols-outlined text-[18px] ${email ? 'text-primary' : 'text-on-surface-variant'}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                  mail
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-semibold ${email ? 'text-primary' : 'text-on-surface'}`}>
                  Notificar por e-mail
                </p>
                <p className="text-[11px] text-on-surface-variant">
                  Envia para os clientes selecionados abaixo
                </p>
              </div>
              <div className={`flex h-5 w-9 shrink-0 items-center rounded-full transition-all ${email ? 'bg-primary' : 'bg-outline-variant/40'}`}>
                <div className={`h-4 w-4 rounded-full bg-white shadow transition-all ${email ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </button>

            {/* Filtro de destinatários */}
            {email && (
              <div className="mt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  Destinatários
                </p>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTS.map(opt => {
                    const active = status.includes(opt.value)
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleStatus(opt.value)}
                        title={opt.desc}
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${
                          active
                            ? 'bg-primary text-white'
                            : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                {status.length === 0 && (
                  <p className="mt-1.5 text-[11px] text-error">Selecione ao menos um grupo.</p>
                )}
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={loading}
                className="flex flex-1 h-10 items-center justify-center rounded-xl border border-outline-variant/30 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={loading || (email && status.length === 0)}
                className="flex flex-1 h-10 items-center justify-center gap-2 rounded-xl bg-primary text-[13px] font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  : 'Publicar'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function ComunicadoUnpublishButton({ id }: { id: string }) {
  const router = useRouter()
  async function handle() {
    try {
      await patchComunicado(id, { publicar: false })
      toast.success('Comunicado despublicado')
      router.refresh()
    } catch { toast.error('Erro ao despublicar') }
  }
  return (
    <button onClick={handle} className="rounded-lg bg-surface-container px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors">
      Despublicar
    </button>
  )
}

export function ComunicadoDeleteButton({ id }: { id: string }) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/comunicados/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Comunicado excluído')
      router.refresh()
    } catch { toast.error('Erro ao excluir') } finally { setLoading(false) }
  }

  return (
    <>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); void handleDelete() }}
        title="Excluir comunicado?"
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        loading={loading}
      />
      <button onClick={() => setConfirmOpen(true)} className="rounded-lg bg-error/10 px-2.5 py-1 text-[11px] font-semibold text-error hover:bg-error/20 transition-colors">
        Excluir
      </button>
    </>
  )
}
