'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

async function patchComunicado(id: string, data: object) {
  const res = await fetch(`/api/crm/comunicados/${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  })
  if (!res.ok) throw new Error()
}

export function ComunicadoPublishButton({ id }: { id: string }) {
  const router = useRouter()
  async function handle() {
    try {
      await patchComunicado(id, { publicar: true })
      toast.success('Comunicado publicado!')
      router.refresh()
    } catch { toast.error('Erro ao publicar') }
  }
  return (
    <button onClick={handle} className="rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors">
      Publicar
    </button>
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
  async function handle() {
    if (!confirm('Excluir este comunicado?')) return
    try {
      const res = await fetch(`/api/crm/comunicados/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Comunicado excluído')
      router.refresh()
    } catch { toast.error('Erro ao excluir') }
  }
  return (
    <button onClick={handle} className="rounded-lg bg-error/10 px-2.5 py-1 text-[11px] font-semibold text-error hover:bg-error/20 transition-colors">
      Excluir
    </button>
  )
}
