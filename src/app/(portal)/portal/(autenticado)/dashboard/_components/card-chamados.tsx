import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const STATUS_CHAMADO: Record<string, { label: string; color: string }> = {
  aberta:             { label: 'Aberta',       color: 'bg-primary/10 text-primary' },
  em_andamento:       { label: 'Em andamento', color: 'bg-orange-status/10 text-orange-status' },
  aguardando_cliente: { label: 'Aguardando',   color: 'bg-yellow-500/10 text-yellow-700' },
  resolvida:          { label: 'Resolvida',    color: 'bg-green-status/10 text-green-status' },
  cancelada:          { label: 'Cancelada',    color: 'bg-surface-container text-on-surface-variant/50' },
}

export async function CardChamados({ clienteId }: { clienteId: string }) {
  const chamados = await prisma.chamado.findMany({
    where: { clienteId },
    orderBy: { criadoEm: 'desc' },
    take: 4,
    select: { id: true, titulo: true, status: true, criadoEm: true },
  })

  const abertos = chamados.filter(o => o.status !== 'resolvida' && o.status !== 'cancelada').length

  return (
    <div className="rounded-[16px] border border-outline-variant/15 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-outline-variant/10 p-4 sm:px-5 sm:py-4">
        <div className="flex items-center gap-2.5">
          <span
            className="material-symbols-outlined text-[20px] text-on-surface-variant"
            style={{ fontVariationSettings: "'FILL' 0" }}
          >
            confirmation_number
          </span>
          <h2 className="font-headline text-[14px] font-semibold text-on-surface">Meus chamados</h2>
          {abertos > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[10px] font-bold text-white">
              {abertos}
            </span>
          )}
        </div>
        <Link
          href="/portal/suporte/chamados/nova"
          className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
          Abrir chamado
        </Link>
      </div>

      {chamados.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span
            className="material-symbols-outlined text-[40px] text-on-surface-variant/25"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            check_circle
          </span>
          <p className="text-[13px] text-on-surface-variant/60">Nenhum chamado ainda</p>
          <Link
            href="/portal/suporte/chamados/nova"
            className="mt-1 rounded-xl border border-outline-variant/20 bg-surface-container px-4 py-2 text-[12px] font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
          >
            Abrir primeiro chamado
          </Link>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-outline-variant/8">
            {chamados.map(o => {
              const s = STATUS_CHAMADO[o.status] ?? STATUS_CHAMADO.aberta
              return (
                <li key={o.id}>
                  <Link
                    href={`/portal/suporte/chamados/${o.id}`}
                    className="flex items-center gap-3 p-4 sm:px-5 sm:py-3.5 hover:bg-surface-container-lowest/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-on-surface truncate">{o.titulo}</p>
                      <p className="text-[11px] text-on-surface-variant/60">
                        {new Date(o.criadoEm).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', s.color)}>
                      {s.label}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
          <div className="border-t border-outline-variant/8 px-5 py-3 text-right">
            <Link href="/portal/suporte" className="text-[12px] font-semibold text-primary hover:underline">
              Ver todos os chamados →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
