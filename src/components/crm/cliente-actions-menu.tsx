'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import type { StatusCliente } from '@prisma/client'
import { EditarClienteDrawer, type ClienteEditData } from './editar-cliente-drawer'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

const STATUS_OPTIONS: { value: StatusCliente; label: string }[] = [
  { value: 'ativo', label: 'Ativo' },
  { value: 'inadimplente', label: 'Inadimplente' },
  { value: 'suspenso', label: 'Suspenso' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'encerrado', label: 'Encerrado' },
]

type Props = { cliente: ClienteEditData }

export function ClienteActionsMenu({ cliente }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null)
  const [loadingDelete, setLoadingDelete] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Posiciona o dropdown usando fixed para escapar de overflow:hidden
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

  async function changeStatus(status: StatusCliente) {
    if (status === cliente.status) { setOpen(false); return }
    setLoadingStatus(status)
    try {
      const res = await fetch(`/api/clientes/${cliente.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      toast.success('Status atualizado')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro ao atualizar status')
    } finally {
      setLoadingStatus(null)
    }
  }

  async function handleDelete() {
    setLoadingDelete(true)
    try {
      const res = await fetch(`/api/clientes/${cliente.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Cliente excluído')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro ao excluir cliente')
    } finally {
      setLoadingDelete(false)
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="rounded-lg p-1 text-on-surface-variant opacity-0 transition-opacity hover:text-on-surface group-hover:opacity-100"
      >
        <span className="material-symbols-outlined text-[18px]">more_vert</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-50 min-w-[200px] overflow-hidden rounded-[12px] border border-outline-variant/20 bg-card shadow-lg"
        >
          {/* Ver detalhes */}
          <Link
            href={`/crm/clientes/${cliente.id}`}
            className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-on-surface transition-colors hover:bg-surface-container-low"
            onClick={() => setOpen(false)}
          >
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">open_in_new</span>
            Ver detalhes
          </Link>

          {/* Editar */}
          <button
            onClick={() => { setOpen(false); setEditOpen(true) }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-on-surface transition-colors hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">edit</span>
            Editar cliente
          </button>

          {/* Divider */}
          <div className="mx-3 my-1 border-t border-outline-variant/15" />

          {/* Mudar status */}
          <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">
            Mudar status
          </p>
          {STATUS_OPTIONS.filter(s => s.value !== cliente.status).map(s => (
            <button
              key={s.value}
              onClick={() => changeStatus(s.value)}
              disabled={loadingStatus !== null}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50"
            >
              {loadingStatus === s.value
                ? <span className="h-3.5 w-3.5 animate-spin rounded-full border border-primary/30 border-t-primary" />
                : <span className="h-1.5 w-1.5 rounded-full bg-on-surface-variant/40" />
              }
              {s.label}
            </button>
          ))}

          {/* Divider */}
          <div className="mx-3 my-1 border-t border-outline-variant/15" />

          {/* Excluir */}
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={loadingDelete}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-error transition-colors hover:bg-error/5 disabled:opacity-50"
          >
            {loadingDelete
              ? <span className="h-3.5 w-3.5 animate-spin rounded-full border border-error/30 border-t-error" />
              : <span className="material-symbols-outlined text-[16px]">delete</span>
            }
            Excluir cliente
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); handleDelete() }}
        title="Excluir cliente?"
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        loading={loadingDelete}
      />

      <EditarClienteDrawer
        cliente={cliente}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
    </>
  )
}
