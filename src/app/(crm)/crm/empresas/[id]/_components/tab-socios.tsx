import { InfoRow, EmptyState } from '@/components/crm/info-card'
import { SocioPortalControls } from '@/components/crm/socio-portal-controls'
import { SocioWhatsAppButton } from '@/components/crm/socio-whatsapp-button'
import { EditarSocioDrawer } from '@/components/crm/editar-socio-drawer'
import { AdicionarSocioDrawer } from '@/components/crm/adicionar-socio-drawer'
import { formatCPF, formatTelefone } from '@/lib/utils'

type Socio = {
  id: string
  nome: string
  cpf: string
  qualificacao: string | null
  participacao: number | null
  email: string | null
  telefone: string | null
  whatsapp: string | null
  principal: boolean
  portalAccess: boolean
}

type Props = {
  empresaId: string
  socios: Socio[]
}

export function TabSocios({ empresaId, socios }: Props) {
  return (
    <>
      <div className="mb-4 flex items-center justify-end">
        <AdicionarSocioDrawer empresaId={empresaId} />
      </div>

      {socios.length === 0 ? (
        <EmptyState icon="group" msg="Nenhum sócio cadastrado nesta empresa" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {socios.map((s) => (
            <div key={s.id} className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card shadow-sm">
              <div className="flex items-center gap-3 px-5 py-4 bg-surface-container-lowest/40">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-on-surface">{s.nome}</p>
                    {s.principal && (
                      <span className="rounded-full bg-green-status/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-status">
                        Principal
                      </span>
                    )}
                  </div>
                  {s.qualificacao && <p className="text-sm text-on-surface-variant">{s.qualificacao}</p>}
                </div>
              </div>
              <div className="space-y-2 border-t border-outline-variant/15 px-5 py-4 text-sm">
                <InfoRow label="CPF" value={formatCPF(s.cpf)} />
                {s.participacao != null && <InfoRow label="Participação" value={`${s.participacao}%`} />}
                <InfoRow label="E-mail" value={s.email ?? '—'} />
                <InfoRow label="Telefone" value={s.telefone ? formatTelefone(s.telefone) : '—'} />
                <InfoRow label="WhatsApp" value={s.whatsapp ? formatTelefone(s.whatsapp) : '—'} />
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-outline-variant/10 px-5 py-3">
                <SocioPortalControls socioId={s.id} temEmail={!!s.email} portalAccess={s.portalAccess} />
                <div className="flex items-center gap-1">
                  <SocioWhatsAppButton
                    socioId={s.id}
                    socioNome={s.nome}
                    telefone={s.telefone}
                    whatsapp={s.whatsapp}
                  />
                  <EditarSocioDrawer socio={{
                    id: s.id,
                    nome: s.nome,
                    cpf: s.cpf,
                    qualificacao: s.qualificacao,
                    participacao: s.participacao,
                    email: s.email,
                    telefone: s.telefone,
                    whatsapp: s.whatsapp,
                    principal: s.principal,
                  }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
