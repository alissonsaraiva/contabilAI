'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import type { TipoUsuario } from '@prisma/client'
import { NovoUsuarioDrawer } from '@/components/crm/novo-usuario-drawer'
import { UsuarioActionsMenu } from '@/components/crm/usuario-actions-menu'
import { formatDate } from '@/lib/utils'
import { TIPOS } from '@/lib/usuarios/constants'

// ─── Config de tipos ──────────────────────────────────────────────────────────

const TIPO_CONFIG: Record<TipoUsuario, { label: string; badge: string }> = {
  admin:      { label: 'Admin',      badge: 'bg-error/10 text-error border border-error/20' },
  contador:   { label: 'Contador',   badge: 'bg-primary/10 text-primary border border-primary/20' },
  assistente: { label: 'Assistente', badge: 'bg-surface-container text-on-surface-variant border border-outline-variant/20' },
}

function getInitials(nome: string) {
  return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type UsuarioRow = {
  id:       string
  nome:     string
  email:    string
  tipo:     TipoUsuario
  ativo:    boolean
  avatar:   string | null
  criadoEm: Date
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function UsuariosClient({ usuarios }: { usuarios: UsuarioRow[] }) {
  const [search,       setSearch]       = useState('')
  const [tipoFilter,   setTipoFilter]   = useState<TipoUsuario | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'ativo' | 'inativo'>('all')

  const filtered = useMemo(() => {
    return usuarios.filter(u => {
      if (search) {
        const q = search.toLowerCase()
        if (!u.nome.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false
      }
      if (tipoFilter !== 'all'    && u.tipo !== tipoFilter)        return false
      if (statusFilter === 'ativo'   && !u.ativo)                  return false
      if (statusFilter === 'inativo' &&  u.ativo)                  return false
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-on-surface">Usuários do CRM</h2>
          <p className="mt-0.5 text-[13px] text-on-surface-variant/80">
            Gerencie quem tem acesso ao painel e suas permissões.
          </p>
        </div>
        <NovoUsuarioDrawer />
      </div>

      {/* Search + filtros */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Campo de busca */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant/40 pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="h-9 w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low pl-9 pr-9 text-[13px] text-on-surface placeholder:text-on-surface-variant/40 shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-on-surface-variant/40 hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          )}
        </div>

        {/* Filtro tipo */}
        <div className="flex items-center rounded-[10px] border border-outline-variant/30 bg-surface-container-low h-9 overflow-hidden shadow-sm">
          {([{ value: 'all', label: 'Todos' }, ...TIPOS] as { value: TipoUsuario | 'all'; label: string }[]).map((t, i, arr) => (
            <button
              key={t.value}
              onClick={() => setTipoFilter(t.value)}
              className={[
                'h-full px-3 text-[12px] font-medium transition-colors',
                i < arr.length - 1 ? 'border-r border-outline-variant/30' : '',
                tipoFilter === t.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-on-surface-variant hover:bg-surface-container',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filtro status */}
        <div className="flex items-center rounded-[10px] border border-outline-variant/30 bg-surface-container-low h-9 overflow-hidden shadow-sm">
          {([
            { value: 'all',    label: 'Todos'   },
            { value: 'ativo',  label: 'Ativo'   },
            { value: 'inativo', label: 'Inativo' },
          ] as { value: 'all' | 'ativo' | 'inativo'; label: string }[]).map((s, i, arr) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={[
                'h-full px-3 text-[12px] font-medium transition-colors',
                i < arr.length - 1 ? 'border-r border-outline-variant/30' : '',
                statusFilter === s.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-on-surface-variant hover:bg-surface-container',
              ].join(' ')}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Contador + limpar */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-on-surface-variant/60">
            {filtered.length} de {usuarios.length} usuário{usuarios.length !== 1 ? 's' : ''}
          </span>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 rounded-lg border border-outline-variant/30 px-2.5 py-1 text-[11px] font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-[12px]">filter_alt_off</span>
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto overflow-y-hidden rounded-[14px] border border-outline-variant/15 bg-card shadow-sm">
        {filtered.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2">
            {hasFilters ? (
              <>
                <span className="material-symbols-outlined text-[28px] text-on-surface-variant/30">search_off</span>
                <p className="text-[13px] text-on-surface-variant">Nenhum usuário encontrado com esses filtros.</p>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[28px] text-on-surface-variant/30">group</span>
                <p className="text-[13px] text-on-surface-variant">Nenhum usuário cadastrado.</p>
              </>
            )}
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant/15">
                <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Usuário</th>
                <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Tipo</th>
                <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Status</th>
                <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Desde</th>
                <th className="px-6 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/15">
              {filtered.map(u => {
                const cfg = TIPO_CONFIG[u.tipo]
                return (
                  <tr key={u.id} className="group transition-colors hover:bg-surface-container-low/50">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        {u.avatar ? (
                          <Image src={u.avatar} alt={u.nome} width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                            {getInitials(u.nome)}
                          </div>
                        )}
                        <div>
                          <p className="text-[14px] font-semibold text-on-surface">{u.nome}</p>
                          <p className="text-[12px] text-on-surface-variant/70">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      {u.ativo ? (
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-green-status">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-status" />
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-on-surface-variant/50">
                          <span className="h-1.5 w-1.5 rounded-full bg-on-surface-variant/30" />
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-[13px] text-on-surface-variant/80">
                      {formatDate(u.criadoEm)}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <UsuarioActionsMenu usuario={u} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Info de permissões */}
      <div className="rounded-[14px] border border-outline-variant/15 bg-card p-5 shadow-sm">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/50">Níveis de acesso</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { tipo: 'Admin',      desc: 'Acesso total: usuários, planos, configurações, todos os dados.',          badge: 'bg-error/10 text-error' },
            { tipo: 'Contador',   desc: 'Acesso ao CRM completo: clientes, leads, tarefas, configurações.',        badge: 'bg-primary/10 text-primary' },
            { tipo: 'Assistente', desc: 'Acesso limitado: tarefas e leads atribuídos a si.',                       badge: 'bg-surface-container text-on-surface-variant' },
          ].map(n => (
            <div key={n.tipo} className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-4">
              <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${n.badge} mb-2`}>
                {n.tipo}
              </span>
              <p className="text-[12px] leading-relaxed text-on-surface-variant/80">{n.desc}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
