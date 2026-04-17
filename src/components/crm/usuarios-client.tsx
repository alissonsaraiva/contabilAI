'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import type { TipoUsuario } from '@prisma/client'
import { NovoUsuarioDrawer } from '@/components/crm/novo-usuario-drawer'
import { UsuarioActionsMenu } from '@/components/crm/usuario-actions-menu'
import { formatDate } from '@/lib/utils'
import { TIPOS } from '@/lib/usuarios/constants'
import { MenuPermissoesConfig } from '@/components/crm/menu-permissoes-config'

// ─── Config de tipos ──────────────────────────────────────────────────────────

const TIPO_CONFIG: Record<TipoUsuario, { label: string; badge: string }> = {
  admin: { label: 'Admin', badge: 'bg-error/10 text-error' },
  contador: { label: 'Contador', badge: 'bg-primary/10 text-primary' },
  assistente: { label: 'Assistente', badge: 'bg-surface-container text-on-surface-variant' },
}

function getInitials(nome: string) {
  return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type UsuarioRow = {
  id: string
  nome: string
  email: string
  tipo: TipoUsuario
  ativo: boolean
  avatar: string | null
  whatsapp: string | null
  criadoEm: Date
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function UsuariosClient({ usuarios, menuPermissoes }: { usuarios: UsuarioRow[]; menuPermissoes: unknown }) {
  const [search, setSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState<TipoUsuario | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'ativo' | 'inativo'>('all')

  const filtered = useMemo(() => {
    return usuarios.filter(u => {
      if (search) {
        const q = search.toLowerCase()
        if (!u.nome.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false
      }
      if (tipoFilter !== 'all' && u.tipo !== tipoFilter) return false
      if (statusFilter === 'ativo' && !u.ativo) return false
      if (statusFilter === 'inativo' && u.ativo) return false
      return true
    })
  }, [usuarios, search, tipoFilter, statusFilter])

  const hasFilters = !!(search || tipoFilter !== 'all' || statusFilter !== 'all')

  function clearFilters() {
    setSearch('')
    setTipoFilter('all')
    setStatusFilter('all')
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-headline text-[24px] font-semibold tracking-tight text-on-surface">Usuários</h2>
            <span className="mt-0.5 rounded-full border border-outline-variant/10 bg-surface-container-lowest px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant/70 shadow-sm">
              {usuarios.length} no CRM
            </span>
          </div>
          <p className="mt-1.5 text-[13px] font-medium text-on-surface-variant/70">
            Gerencie quem tem acesso ao painel e suas permissões.
          </p>
        </div>
        <NovoUsuarioDrawer />
      </div>

      {/* Search + filtros */}
      <div className="flex flex-col gap-4">
        {/* Search input and clear button */}
        <div className="flex w-full gap-3">
          <div className="group relative flex-1">
            <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant/40 transition-colors group-focus-within:text-primary">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome ou e-mail..."
              className="h-12 w-full rounded-2xl border border-transparent bg-surface-container-lowest/80 pl-11 pr-10 text-[14px] font-medium text-on-surface shadow-sm placeholder:text-on-surface-variant/40 transition-all hover:bg-surface-container-lowest focus:border-primary/30 focus:bg-card focus:outline-none focus:ring-4 focus:ring-primary/5"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant/40 transition-colors hover:bg-surface-container hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex h-12 w-12 sm:w-auto items-center justify-center gap-1.5 rounded-2xl border border-outline-variant/15 bg-card px-0 sm:px-4 text-[13px] font-semibold tracking-wide text-on-surface-variant shadow-sm transition-all hover:border-outline-variant/30 hover:bg-surface-container-lowest hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-[18px]">filter_list_off</span>
              <span className="hidden sm:inline">Limpar filtros</span>
            </button>
          )}
        </div>

        {/* Segmented Controls */}
        <div className="flex flex-wrap gap-4">
          {/* Filtro tipo */}
          <div className="flex w-full overflow-x-auto custom-scrollbar sm:w-auto items-center rounded-2xl bg-surface-container-lowest/80 p-1 border border-outline-variant/10 shadow-sm">
            {([{ value: 'all', label: 'Todos os tipos' }, ...TIPOS] as { value: TipoUsuario | 'all'; label: string }[]).map((t) => {
              const active = tipoFilter === t.value
              return (
                <button
                  key={t.value}
                  onClick={() => setTipoFilter(t.value)}
                  className={[
                    'shrink-0 rounded-xl px-4 py-2 text-[10px] font-extrabold uppercase tracking-widest transition-all border',
                    active
                      ? 'bg-card text-on-surface shadow-sm ring-1 ring-outline-variant/5 border-transparent'
                      : 'text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-low/50 border-transparent',
                  ].join(' ')}
                >
                  {t.label}
                </button>
              )
            })}
          </div>

          {/* Filtro status */}
          <div className="flex w-full overflow-x-auto custom-scrollbar sm:w-auto items-center rounded-2xl bg-surface-container-lowest/80 p-1 border border-outline-variant/10 shadow-sm">
            {([
              { value: 'all', label: 'Todos os status' },
              { value: 'ativo', label: 'Ativos' },
              { value: 'inativo', label: 'Inativos' },
            ] as { value: 'all' | 'ativo' | 'inativo'; label: string }[]).map((s) => {
              const active = statusFilter === s.value
              return (
                <button
                  key={s.value}
                  onClick={() => setStatusFilter(s.value)}
                  className={[
                    'shrink-0 rounded-xl px-4 py-2 text-[10px] font-extrabold uppercase tracking-widest transition-all border',
                    active
                      ? 'bg-card text-on-surface shadow-sm ring-1 ring-outline-variant/5 border-transparent'
                      : 'text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-low/50 border-transparent',
                  ].join(' ')}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tabela */}
      {filtered.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest/30 shadow-sm text-center">
          <span className="material-symbols-outlined text-[32px] text-on-surface-variant/20">
            {hasFilters ? 'search_off' : 'group'}
          </span>
          <p className="text-[12px] font-medium text-on-surface-variant/50">
            {hasFilters
              ? 'Nenhum usuário encontrado com esses filtros.'
              : 'Nenhum usuário cadastrado.'}
          </p>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-[11px] font-bold uppercase tracking-widest text-primary transition-colors hover:text-primary/80"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card shadow-sm">
          <div className="overflow-x-auto overflow-y-hidden custom-scrollbar">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant/10 bg-surface-container-lowest/40">
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Usuário</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Tipo</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Status</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Desde</th>
                  <th className="px-6 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {filtered.map(u => {
                  const cfg = TIPO_CONFIG[u.tipo]
                  return (
                    <tr key={u.id} className="group transition-colors duration-200 hover:bg-surface-container-lowest/80">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {u.avatar ? (
                            <Image src={u.avatar} alt={u.nome} width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                              {getInitials(u.nome)}
                            </div>
                          )}
                          <div>
                            <p className="text-[13px] font-medium text-on-surface">{u.nome}</p>
                            <p className="text-[11px] text-on-surface-variant/60 mt-0.5">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-[4px] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest border border-current/10 ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {u.ativo ? (
                          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-green-status/90">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-status/90" />
                            Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-on-surface-variant/50">
                            <span className="h-1.5 w-1.5 rounded-full bg-on-surface-variant/30" />
                            Inativo
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-[12px] font-medium text-on-surface-variant/60">
                        {formatDate(u.criadoEm)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <UsuarioActionsMenu usuario={u} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Permissões de menu por perfil */}
      <MenuPermissoesConfig initialPermissoes={menuPermissoes} />

      {/* Info de perfis */}
      <div className="rounded-xl border border-outline-variant/20 bg-card p-6 shadow-sm">
        <p className="mb-4 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/50">Níveis de acesso</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { tipo: 'Admin', desc: 'Acesso total: configurações, usuários, planos, IA e todos os dados do CRM.', badge: 'bg-error/10 text-error' },
            { tipo: 'Contador', desc: 'Acesso operacional com menus configuráveis acima.', badge: 'bg-primary/10 text-primary' },
            { tipo: 'Assistente', desc: 'Perfil operacional com menus configuráveis acima.', badge: 'bg-surface-container text-on-surface-variant' },
          ].map(n => (
            <div key={n.tipo} className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest/40 p-5">
              <span className={`inline-flex items-center rounded-[4px] border border-current/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest ${n.badge} mb-3`}>
                {n.tipo}
              </span>
              <p className="text-[12px] font-medium leading-relaxed text-on-surface-variant/70">{n.desc}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
