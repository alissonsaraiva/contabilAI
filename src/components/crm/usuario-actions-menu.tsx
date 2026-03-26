'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { TipoUsuario } from '@prisma/client'
import { EditarUsuarioDrawer } from './editar-usuario-drawer'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

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

type SenhaResetada = {
  nome: string
  email: string
  senha: string
}

function ModalSenhaResetada({ dados, onClose }: { dados: SenhaResetada; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false)
  const urlCrm = typeof window !== 'undefined' ? window.location.origin + '/login' : ''

  const mensagem =
    `Olá, *${dados.nome}*! 👋\n\n` +
    `Sua senha foi redefinida:\n\n` +
    `🌐 *Link:* ${urlCrm}\n` +
    `📧 *E-mail:* ${dados.email}\n` +
    `🔑 *Nova senha temporária:* \`${dados.senha}\`\n\n` +
    `⚠️ No próximo acesso você será solicitado a criar uma nova senha.`

  async function copiar() {
    await navigator.clipboard.writeText(mensagem)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm overflow-hidden rounded-[16px] border border-outline-variant/20 bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/10">
            <span className="material-symbols-outlined text-[18px] text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>lock_reset</span>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-on-surface">Senha redefinida</h3>
            <p className="text-[12px] text-on-surface-variant">Compartilhe os novos dados de acesso</p>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          <div className="space-y-3 rounded-xl border border-outline-variant/15 bg-surface-container-low p-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50">E-mail</p>
              <p className="text-[13px] font-medium text-on-surface">{dados.email}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50">Senha temporária</p>
              <code className="block rounded-lg bg-card border border-outline-variant/20 px-3 py-1.5 text-[13px] font-mono text-on-surface">
                {dados.senha}
              </code>
            </div>
          </div>

          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2.5">
            <p className="text-[11px] leading-relaxed text-amber-600">
              Salve esses dados agora. A senha não será exibida novamente.
            </p>
          </div>

          {/* Prévia mensagem */}
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/50">Mensagem para enviar</p>
            <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-3">
              <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-on-surface-variant/80">
                {mensagem}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-outline-variant/15 px-5 py-4">
          <button
            onClick={copiar}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-2 text-[13px] font-semibold text-on-surface transition-colors hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-[15px]">{copiado ? 'check' : 'content_copy'}</span>
            {copiado ? 'Copiado!' : 'Copiar para WhatsApp'}
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

export function UsuarioActionsMenu({ usuario }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const [editarOpen, setEditarOpen] = useState(false)
  const [senhaResetada, setSenhaResetada] = useState<SenhaResetada | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
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

  async function handleResetSenha() {
    setOpen(false)
    setLoading(true)
    try {
      const res = await fetch(`/api/usuarios/${usuario.id}/reset-senha`, { method: 'POST' })
      if (res.status === 403) { toast.error('Sem permissão'); return }
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSenhaResetada({ nome: data.nome, email: data.email, senha: data.senhaGerada })
    } catch {
      toast.error('Erro ao resetar senha')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
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
          {/* Editar */}
          <button
            onClick={() => { setOpen(false); setEditarOpen(true) }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-on-surface transition-colors hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">edit</span>
            Editar usuário
          </button>

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

          {/* Reset senha */}
          <button
            onClick={handleResetSenha}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-on-surface transition-colors hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">lock_reset</span>
            Resetar senha
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
            onClick={() => setConfirmOpen(true)}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-error transition-colors hover:bg-error/5"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
            Excluir usuário
          </button>
        </div>
      )}

      <EditarUsuarioDrawer
        usuario={usuario}
        open={editarOpen}
        onClose={() => setEditarOpen(false)}
      />

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); handleDelete() }}
        title={`Excluir "${usuario.nome}"?`}
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        loading={loading}
      />

      {senhaResetada && (
        <ModalSenhaResetada
          dados={senhaResetada}
          onClose={() => setSenhaResetada(null)}
        />
      )}
    </>
  )
}
