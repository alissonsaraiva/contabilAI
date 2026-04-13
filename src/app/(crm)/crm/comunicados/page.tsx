import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui/card'
import { ComunicadoForm } from '@/components/crm/comunicado-form'
import { ComunicadoPublishButton, ComunicadoUnpublishButton, ComunicadoDeleteButton } from '@/components/crm/comunicado-buttons'

const TIPO_COM: Record<string, { label: string; color: string; icon: string }> = {
  informativo: { label: 'Informativo', color: 'text-blue-600 bg-blue-500/10',    icon: 'info' },
  alerta:      { label: 'Alerta',      color: 'text-yellow-600 bg-yellow-500/10', icon: 'warning' },
  obrigacao:   { label: 'Obrigação',   color: 'text-error bg-error/10',           icon: 'event_busy' },
  promocional: { label: 'Promoção',    color: 'text-green-status bg-green-status/10', icon: 'campaign' },
}

export default async function CrmComunicadosPage() {
  const session = await auth()
  if (!session) redirect('/crm/login')

  const comunicados = await prisma.comunicado.findMany({
    orderBy: { criadoEm: 'desc' },
    take:    50,
  })

  const publicados = comunicados.filter(c => c.publicado)
  const rascunhos  = comunicados.filter(c => !c.publicado)

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="font-headline text-2xl font-semibold text-on-surface">Comunicados</h1>
        <p className="text-sm text-on-surface-variant/70 mt-0.5">
          Publique comunicados visíveis no portal de todos os clientes.
        </p>
      </div>

      {/* Novo comunicado */}
      <ComunicadoForm />

      {/* Publicados */}
      {publicados.length > 0 && (
        <div>
          <h2 className="mb-3 text-[14px] font-semibold text-on-surface">Publicados ({publicados.length})</h2>
          <div className="space-y-3">
            {publicados.map(c => {
              const tc = TIPO_COM[c.tipo] ?? TIPO_COM['informativo']!
              const expirado = c.expiradoEm && new Date(c.expiradoEm) < new Date()
              return (
                <Card key={c.id} className={`border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm ${expirado ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-3">
                    <span
                      className={`material-symbols-outlined mt-0.5 text-[20px] shrink-0 ${tc.color.split(' ')[0]!}`}
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      {tc.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-[13px] font-semibold text-on-surface">{c.titulo}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          {expirado && <span className="rounded-full bg-on-surface-variant/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant/50">Expirado</span>}
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tc.color}`}>{tc.label}</span>
                          <ComunicadoUnpublishButton id={c.id} />
                        </div>
                      </div>
                      <p className="text-[12px] text-on-surface-variant/80 leading-relaxed">{c.conteudo}</p>
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-on-surface-variant/50">
                        {c.publicadoEm && <span>Publicado {new Date(c.publicadoEm).toLocaleDateString('pt-BR')}</span>}
                        {c.expiradoEm && <span>Expira {new Date(c.expiradoEm).toLocaleDateString('pt-BR')}</span>}
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Rascunhos */}
      {rascunhos.length > 0 && (
        <div>
          <h2 className="mb-3 text-[14px] font-semibold text-on-surface">Rascunhos ({rascunhos.length})</h2>
          <div className="space-y-3">
            {rascunhos.map(c => {
              const tc = TIPO_COM[c.tipo] ?? TIPO_COM['informativo']!
              return (
                <Card key={c.id} className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm opacity-70">
                  <div className="flex items-start gap-3">
                    <span
                      className={`material-symbols-outlined mt-0.5 text-[20px] shrink-0 ${tc.color.split(' ')[0]!}`}
                      style={{ fontVariationSettings: "'FILL' 0" }}
                    >
                      {tc.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-[13px] font-semibold text-on-surface">{c.titulo}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant/50">Rascunho</span>
                          <ComunicadoPublishButton id={c.id} />
                          <ComunicadoDeleteButton id={c.id} />
                        </div>
                      </div>
                      <p className="text-[12px] text-on-surface-variant/80">{c.conteudo}</p>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {comunicados.length === 0 && (
        <Card className="border-outline-variant/15 bg-card/60 p-10 rounded-[16px] shadow-sm flex flex-col items-center gap-3 text-center">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant/25">campaign</span>
          <p className="text-[14px] font-medium text-on-surface-variant/60">Nenhum comunicado criado ainda.</p>
        </Card>
      )}
    </div>
  )
}
