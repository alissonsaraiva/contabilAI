import { auth } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { Card } from '@/components/ui/card'
import { PortalPushToggle } from '@/components/portal/portal-push-toggle'

export default async function PortalConfiguracoesPage() {
  const session = await auth()
  const user = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) redirect('/portal/login')

  const clienteId = await resolveClienteId(user)
  if (!clienteId) redirect('/portal/login')

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    include: {
      empresa: {
        include: { socios: true },
      },
    },
  })

  if (!cliente) redirect('/portal/login')

  const sociosComAcesso = cliente.empresa?.socios.filter(s => s.portalAccess) ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-semibold text-on-surface">Configurações</h1>
        <p className="text-sm text-on-surface-variant/70 mt-1">
          Gerencie seus dados de acesso e permissões do portal.
        </p>
      </div>

      {/* Dados de acesso */}
      <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant/60">lock</span>
          <h2 className="text-[14px] font-semibold text-on-surface">Dados de acesso</h2>
        </div>
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 sm:py-2.5 border-b border-outline-variant/10">
            <div>
              <p className="text-[13px] font-medium text-on-surface">{user.name ?? cliente.nome}</p>
              <p className="text-[12px] text-on-surface-variant/60">{user.email ?? cliente.email}</p>
            </div>
            <div className="w-auto self-start sm:self-center">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${user.tipo === 'cliente' ? 'text-primary bg-primary/10' : 'text-on-surface-variant bg-surface-container'
                }`}>
                {user.tipo === 'cliente' ? 'Titular' : 'Sócio'}
              </span>
            </div>
          </div>
          <p className="text-[12px] text-on-surface-variant/60 leading-relaxed">
            O acesso ao portal é feito por link mágico enviado para o seu e-mail cadastrado.
            Para alterar seu e-mail, entre em contato com o escritório.
          </p>
        </div>
      </Card>

      {/* Sócios com acesso (visível apenas para o titular) */}
      {user.tipo === 'cliente' && cliente.empresa && (
        <Card className="border-outline-variant/15 bg-card/60 p-4 sm:p-5 rounded-[16px] shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant/60">group</span>
            <h2 className="text-[14px] font-semibold text-on-surface">Sócios com acesso ao portal</h2>
          </div>
          {sociosComAcesso.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl bg-surface-container-low/60 px-4 py-3">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant/30">person_off</span>
              <p className="text-[13px] text-on-surface-variant/60">
                Nenhum sócio tem acesso ao portal no momento.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {sociosComAcesso.map(socio => (
                <li key={socio.id} className="flex items-center gap-3 rounded-xl bg-surface-container-low/60 px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[12px] font-bold text-primary">
                    {socio.nome.split(' ').map(n => n[0]).slice(0, 2).join('')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-on-surface">{socio.nome}</p>
                    {socio.email && <p className="text-[11px] text-on-surface-variant/60">{socio.email}</p>}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-green-status bg-green-status/10 rounded-full px-2 py-0.5">
                    Acesso ativo
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[12px] text-on-surface-variant/50">
            Para gerenciar permissões de sócios, entre em contato com o escritório.
          </p>
        </Card>
      )}

      {/* Notificações */}
      <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant/60">notifications</span>
          <h2 className="text-[14px] font-semibold text-on-surface">Notificações</h2>
        </div>
        <div className="space-y-3">
          {/* E-mail — sempre ativo */}
          <div className="flex items-center gap-3 rounded-xl bg-surface-container-low/60 px-4 py-3">
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant/50" style={{ fontVariationSettings: "'FILL' 1" }}>email</span>
            <p className="text-[13px] text-on-surface-variant/70">
              Avisos importantes são enviados para <strong className="text-on-surface">{user.email ?? cliente.email}</strong>.
            </p>
          </div>
          {/* Push — controlado pelo cliente */}
          <PortalPushToggle />
        </div>
      </Card>
    </div>
  )
}
