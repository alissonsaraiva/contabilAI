'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { TipoUsuario } from '@prisma/client'

const TIPOS: { value: TipoUsuario; label: string }[] = [
  { value: 'assistente', label: 'Assistente' },
  { value: 'contador', label: 'Contador' },
  { value: 'admin', label: 'Admin' },
]

type Usuario = {
  id: string
  nome: string
  email: string
  tipo: TipoUsuario
  ativo: boolean
}

type Props = { usuario: Usuario }

export function UsuarioActionsMenu({ usuario }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    setOpen(v => !v)
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function patch(data: Record<string, unknown>, successMsg: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/usuarios/${usuario.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.status === 403) { toast.error('Sem permissão'); return }
      if (!res.ok) throw new Error()
      toast.success(successMsg)
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro ao atualizar')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Excluir o usuário "${usuario.nome}" permanentemente?`)) return
    setLoading(true)
    try {
      const res = await fetch(`/api/usuarios/${usuario.id}`, { method: 'DELETE' })
      if (res.status === 400) { const d = await res.json(); toast.error(d.error); return }
      if (res.status === 403) { toast.error('Sem permissão'); return }
      if (!res.ok) throw new Error()
      toast.success('Usuário excluído')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro ao excluir')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        disabled={loading}
        className="rounded-lg p-1 text-on-surface-variant opacity-0 transition-opacity hover:text-on-surface group-hover:opacity-100 disabled:opacity-30"
      >
        <span className="material-symbols-outlined text-[18px]">more_vert</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-50 min-w-[200px] overflow-hidden rounded-[12px] border border-outline-variant/20 bg-card shadow-lg"
        >
          {/* Toggle ativo */}
          <button
            onClick={() => patch({ ativo: !usuario.ativo }, usuario.ativo ? 'Usuário desativado' : 'Usuário ativado')}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-on-surface transition-colors hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
              {usuario.ativo ? 'person_off' : 'person_check'}
            </span>
            {usuario.ativo ? 'Desativar acesso' : 'Reativar acesso'}
          </button>

          {/* Divider */}
          <div className="mx-3 my-1 border-t border-outline-variant/15" />

          {/* Mudar tipo */}
          <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">Mudar tipo</p>
          {TIPOS.filter(t => t.value !== usuario.tipo).map(t => (
            <button
              key={t.value}
              onClick={() => patch({ tipo: t.value }, `Tipo alterado para ${t.label}`)}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-on-surface transition-colors hover:bg-surface-container-low"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-on-surface-variant/40" />
              {t.label}
            </button>
          ))}

          {/* Divider */}
          <div className="mx-3 my-1 border-t border-outline-variant/15" />

          {/* Excluir */}
          <button
            onClick={handleDelete}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-error transition-colors hover:bg-error/5"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
            Excluir usuário
          </button>
        </div>
      )}
    </>
  )
}
