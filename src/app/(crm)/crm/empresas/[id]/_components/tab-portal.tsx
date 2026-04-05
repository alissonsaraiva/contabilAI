import { EmptyState } from '@/components/crm/info-card'
import { PortalLinkButton } from '@/components/crm/portal-link-button'
import { SocioPortalControls } from '@/components/crm/socio-portal-controls'
import { SocioWhatsAppButton } from '@/components/crm/socio-whatsapp-button'

type Socio = {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  whatsapp: string | null
  portalAccess: boolean
}

type Props = {
  cliente: { id: string; nome: string; email: string | null; status: string } | null
  socios: Socio[]
}

export function TabPortal({ cliente, socios }: Props) {
  if (!cliente && socios.length === 0) {
    return <EmptyState icon="lock" msg="Nenhuma pessoa vinculada a esta empresa" />
  }

  return (
    <div className="space-y-3">
      {cliente && (
        <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card shadow-sm">
          <div className="flex items-center justify-between gap-4 px-5 py-4 bg-surface-container-lowest/40">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <span className="material-symbols-outlined text-[16px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-on-surface">{cliente.nome}</p>
                <p className="text-xs text-on-surface-variant">{cliente.email} · Titular</p>
              </div>
            </div>
            <PortalLinkButton clienteId={cliente.id} status={cliente.status} />
          </div>
        </div>
      )}

      {socios.map(s => (
        <div key={s.id} className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card shadow-sm">
          <div className="flex items-center justify-between gap-4 px-5 py-4 bg-surface-container-lowest/40">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container">
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-on-surface">{s.nome}</p>
                <p className="text-xs text-on-surface-variant">{s.email ?? 'sem e-mail'} · Sócio</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SocioWhatsAppButton
                socioId={s.id}
                socioNome={s.nome}
                telefone={s.telefone}
                whatsapp={s.whatsapp}
              />
              <SocioPortalControls socioId={s.id} temEmail={!!s.email} portalAccess={s.portalAccess} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
