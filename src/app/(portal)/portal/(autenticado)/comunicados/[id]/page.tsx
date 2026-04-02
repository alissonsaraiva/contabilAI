import { auth } from '@/lib/auth-portal'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { BackButton } from '@/components/ui/back-button'

const TIPO_COMUNICADO: Record<string, { label: string; color: string; icon: string }> = {
  informativo: { label: 'Informativo', color: 'text-blue-600 bg-blue-500/10', icon: 'info' },
  alerta: { label: 'Alerta', color: 'text-yellow-600 bg-yellow-500/10', icon: 'warning' },
  obrigacao: { label: 'Obrigação', color: 'text-error bg-error/10', icon: 'event_busy' },
  promocional: { label: 'Promoção', color: 'text-green-status bg-green-status/10', icon: 'sell' },
}

type Props = { params: Promise<{ id: string }> }

export default async function ComunicadoDetailPage({ params }: Props) {
  const session = await auth()
  const user = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) redirect('/portal/login')

  const clienteId = await resolveClienteId(user)
  if (!clienteId) redirect('/portal/login')

  const { id } = await params

  const now = new Date()
  const comunicado = await prisma.comunicado.findFirst({
    where: {
      id,
      publicado: true,
      OR: [
        { expiradoEm: null },
        { expiradoEm: { gt: now } },
      ],
    },
    select: {
      id: true,
      titulo: true,
      conteudo: true,
      tipo: true,
      publicadoEm: true,
      expiradoEm: true,
      anexoUrl: true,
      anexoNome: true,
    },
  })

  if (!comunicado) notFound()

  const tc = TIPO_COMUNICADO[comunicado.tipo] ?? TIPO_COMUNICADO.informativo

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">

      {/* Voltar */}
      <BackButton className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-on-surface-variant/70 hover:text-on-surface transition-colors">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Voltar
      </BackButton>

      {/* Card principal */}
      <div className="rounded-[20px] border border-outline-variant/15 bg-card shadow-sm overflow-hidden">

        {/* Header */}
        <div className="border-b border-outline-variant/10 p-4 sm:px-6 sm:py-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8">
                <span
                  className={`material-symbols-outlined text-[22px] ${tc.color.split(' ')[0]}`}
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {tc.icon}
                </span>
              </div>
              <div>
                <h1 className="font-headline text-[17px] font-semibold text-on-surface leading-tight">
                  {comunicado.titulo}
                </h1>
                {comunicado.publicadoEm && (
                  <p className="mt-0.5 text-[12px] text-on-surface-variant/60">
                    Publicado em {new Date(comunicado.publicadoEm).toLocaleDateString('pt-BR', {
                      day: '2-digit', month: 'long', year: 'numeric',
                    })}
                  </p>
                )}
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${tc.color}`}>
              {tc.label}
            </span>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="p-4 sm:px-6 sm:py-5">
          <p className="text-[14px] text-on-surface/85 leading-relaxed whitespace-pre-wrap">
            {comunicado.conteudo}
          </p>
        </div>

        {/* Anexo */}
        {comunicado.anexoUrl && (
          <div className="border-t border-outline-variant/10 p-4 sm:px-6 sm:py-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/50">
              Anexo
            </p>
            <a
              href={comunicado.anexoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-surface-container px-4 py-2.5 text-[13px] font-semibold text-primary hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              {comunicado.anexoNome ?? 'Baixar anexo'}
            </a>
          </div>
        )}

        {/* Expiração */}
        {comunicado.expiradoEm && (
          <div className="border-t border-outline-variant/10 p-4 sm:px-6 sm:py-3">
            <p className="text-[11px] text-on-surface-variant/50">
              Válido até {new Date(comunicado.expiradoEm).toLocaleDateString('pt-BR')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
