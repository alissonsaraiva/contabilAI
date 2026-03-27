import { auth } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui/card'

export default async function PortalDocumentosPage() {
  const session   = await auth()
  const clienteId = (session?.user as any)?.id
  if (!clienteId) redirect('/portal/login')

  const documentos = await prisma.documento.findMany({
    where:   { clienteId },
    orderBy: { criadoEm: 'desc' },
  })

  const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    pendente:  { label: 'Pendente',  color: 'text-yellow-600 bg-yellow-500/10' },
    enviado:   { label: 'Enviado',   color: 'text-blue-600 bg-blue-500/10' },
    aprovado:  { label: 'Aprovado',  color: 'text-green-status bg-green-status/10' },
    rejeitado: { label: 'Rejeitado', color: 'text-error bg-error/10' },
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-semibold text-on-surface">Documentos</h1>
        <p className="text-sm text-on-surface-variant/70 mt-1">
          Seus documentos enviados e pendentes de entrega ao escritório.
        </p>
      </div>

      {documentos.length === 0 ? (
        <Card className="border-outline-variant/15 bg-card/60 p-10 rounded-[16px] shadow-sm flex flex-col items-center gap-3 text-center">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant/25">folder_open</span>
          <p className="text-[14px] font-medium text-on-surface-variant/60">Nenhum documento encontrado.</p>
        </Card>
      ) : (
        <Card className="border-outline-variant/15 bg-card/60 rounded-[16px] shadow-sm overflow-hidden">
          <ul className="divide-y divide-outline-variant/10">
            {documentos.map(d => {
              const s = STATUS_LABEL[d.status] ?? { label: d.status, color: 'text-on-surface-variant' }
              return (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant/50 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
                    description
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-on-surface truncate">{d.nome}</p>
                    <p className="text-[11px] text-on-surface-variant/60">
                      {d.tipo} · {new Date(d.criadoEm).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.color}`}>
                    {s.label}
                  </span>
                  {d.url && (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/60 hover:bg-surface-container hover:text-primary transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">download</span>
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
