import { prisma } from '@/lib/prisma'
import { formatDate } from '@/lib/utils'
import type { TipoUsuario } from '@prisma/client'
import { NovoUsuarioDrawer } from '@/components/crm/novo-usuario-drawer'
import { UsuarioActionsMenu } from '@/components/crm/usuario-actions-menu'

const TIPO_CONFIG: Record<TipoUsuario, { label: string; badge: string }> = {
  admin: { label: 'Admin', badge: 'bg-error/10 text-error border border-error/20' },
  contador: { label: 'Contador', badge: 'bg-primary/10 text-primary border border-primary/20' },
  assistente: { label: 'Assistente', badge: 'bg-surface-container text-on-surface-variant border border-outline-variant/20' },
}

function getInitials(nome: string) {
  return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

export default async function UsuariosPage() {
  const usuarios = await prisma.usuario.findMany({
    orderBy: { criadoEm: 'asc' },
    select: { id: true, nome: true, email: true, tipo: true, ativo: true, avatar: true, criadoEm: true },
  })

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

      {/* Tabela */}
      <div className="overflow-x-auto overflow-y-hidden rounded-[14px] border border-outline-variant/15 bg-card shadow-sm">
        {usuarios.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[28px] text-on-surface-variant/30">group</span>
            <p className="text-[13px] text-on-surface-variant">Nenhum usuário cadastrado.</p>
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
              {usuarios.map(u => {
                const cfg = TIPO_CONFIG[u.tipo]
                return (
                  <tr key={u.id} className="group transition-colors hover:bg-surface-container-low/50">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        {u.avatar ? (
                          <img src={u.avatar} alt={u.nome} className="h-8 w-8 rounded-full object-cover" />
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
            { tipo: 'Admin', desc: 'Acesso total: usuários, planos, configurações, todos os dados.', badge: 'bg-error/10 text-error' },
            { tipo: 'Contador', desc: 'Acesso ao CRM completo: clientes, leads, tarefas, configurações.', badge: 'bg-primary/10 text-primary' },
            { tipo: 'Assistente', desc: 'Acesso limitado: tarefas e leads atribuídos a si.', badge: 'bg-surface-container text-on-surface-variant' },
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
