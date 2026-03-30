'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { TipoUsuario } from '@prisma/client'
import { EditarUsuarioDrawer } from './editar-usuario-drawer'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { TIPOS } from '@/lib/usuarios/constants'

type Usuario = {
  id: string
  nome: string
  email: string
  tipo: TipoUsuario
  ativo: boolean
}

type Props = { usuario: Usuario }

type SenhaResetada = { nome: string; email: string; senha: string }

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
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm gap-0 p-0 overflow-hidden bg-card" showCloseButton={false}>
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
      </DialogContent>
    </Dialog>
  )
}

// ─── Estilos reutilizáveis dos itens ──────────────────────────────────────────
const ITEM_BASE = 'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-4 py-2.5 text-[13px] font-medium text-on-surface focus:bg-surface-container-low focus:text-on-surface'
const ITEM_DANGER = 'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-4 py-2.5 text-[13px] font-medium text-error focus:bg-error/5 focus:text-error'

// ─── Componente principal ─────────────────────────────────────────────────────

export function UsuarioActionsMenu({ usuario }: Props) {
  const router = useRouter()
  const [editarOpen, setEditarOpen]       = useState(false)
  const [senhaResetada, setSenhaResetada] = useState<SenhaResetada | null>(null)
  const [confirmOpen, setConfirmOpen]     = useState(false)
  const [loadingToggle, setLoadingToggle] = useState(false)
  const [loadingReset, setLoadingReset]   = useState(false)
  const [loadingDelete, setLoadingDelete] = useState(false)
  const [loadingTipo, setLoadingTipo]     = useState<TipoUsuario | null>(null)

  const anyLoading = loadingToggle || loadingReset || loadingDelete || loadingTipo !== null

  async function handleToggleAtivo() {
    setLoadingToggle(true)
    try {
      const res = await fetch(`/api/usuarios/${usuario.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: !usuario.ativo }),
      })
      if (res.status === 403) { toast.error('Sem permissão'); return }
      if (!res.ok) throw new Error()
      toast.success(usuario.ativo ? 'Usuário desativado' : 'Usuário ativado')
      router.refresh()
    } catch {
      toast.error('Erro ao atualizar')
    } finally {
      setLoadingToggle(false)
    }
  }

  async function handleMudarTipo(tipo: TipoUsuario, label: string) {
    setLoadingTipo(tipo)
    try {
      const res = await fetch(`/api/usuarios/${usuario.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo }),
      })
      if (res.status === 403) { toast.error('Sem permissão'); return }
      if (!res.ok) throw new Error()
      toast.success(`Tipo alterado para ${label}`)
      router.refresh()
    } catch {
      toast.error('Erro ao atualizar')
    } finally {
      setLoadingTipo(null)
    }
  }

  async function handleResetSenha() {
    setLoadingReset(true)
    try {
      const res = await fetch(`/api/usuarios/${usuario.id}/reset-senha`, { method: 'POST' })
      if (res.status === 403) { toast.error('Sem permissão'); return }
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSenhaResetada({ nome: data.nome, email: data.email, senha: data.senhaGerada })
    } catch {
      toast.error('Erro ao resetar senha')
    } finally {
      setLoadingReset(false)
    }
  }

  async function handleDelete() {
    setLoadingDelete(true)
    try {
      const res = await fetch(`/api/usuarios/${usuario.id}`, { method: 'DELETE' })
      if (res.status === 400) { const d = await res.json(); toast.error(d.error); return }
      if (res.status === 403) { toast.error('Sem permissão'); return }
      if (!res.ok) throw new Error()
      toast.success('Usuário excluído')
      router.refresh()
    } catch {
      toast.error('Erro ao excluir')
    } finally {
      setLoadingDelete(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={anyLoading}
          className="rounded-lg p-1 text-on-surface-variant opacity-0 transition-opacity hover:text-on-surface group-hover:opacity-100 disabled:opacity-30"
        >
          {anyLoading
            ? <span className="block h-4 w-4 animate-spin rounded-full border-2 border-on-surface-variant/30 border-t-on-surface-variant" />
            : <span className="material-symbols-outlined text-[18px]">more_vert</span>
          }
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side="bottom"
          align="end"
          className="min-w-[200px] rounded-[12px] border border-outline-variant/20 bg-card p-1 shadow-lg"
        >
          {/* Editar */}
          <DropdownMenuItem
            onClick={() => setEditarOpen(true)}
            className={ITEM_BASE}
          >
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">edit</span>
            Editar usuário
          </DropdownMenuItem>

          {/* Toggle ativo */}
          <DropdownMenuItem
            onClick={handleToggleAtivo}
            className={ITEM_BASE}
          >
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
              {usuario.ativo ? 'person_off' : 'person_check'}
            </span>
            {usuario.ativo ? 'Desativar acesso' : 'Reativar acesso'}
          </DropdownMenuItem>

          {/* Reset senha */}
          <DropdownMenuItem
            onClick={handleResetSenha}
            className={ITEM_BASE}
          >
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">lock_reset</span>
            Resetar senha
          </DropdownMenuItem>

          <DropdownMenuSeparator className="mx-3 my-1" />

          {/* Mudar tipo */}
          <DropdownMenuLabel className="px-4 pb-1 pt-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">
            Mudar tipo
          </DropdownMenuLabel>
          {TIPOS.filter(t => t.value !== usuario.tipo).map(t => (
            <DropdownMenuItem
              key={t.value}
              onClick={() => handleMudarTipo(t.value, t.label)}
              className={ITEM_BASE}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-on-surface-variant/40" />
              {t.label}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator className="mx-3 my-1" />

          {/* Excluir */}
          <DropdownMenuItem
            onClick={() => setConfirmOpen(true)}
            className={ITEM_DANGER}
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
            Excluir usuário
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
        loading={loadingDelete}
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
