import { prisma } from '@/lib/prisma'
import Link from 'next/link'

const TIPO_ICON: Record<string, string> = {
  alerta:    'warning',
  obrigacao: 'assignment',
}

export async function CardComunicados() {
  const comunicados = await prisma.comunicado.findMany({
    where: {
      publicado: true,
      OR: [{ expiradoEm: null }, { expiradoEm: { gt: new Date() } }],
    },
    orderBy: { publicadoEm: 'desc' },
    take: 3,
    select: { id: true, titulo: true, tipo: true, publicadoEm: true },
  })

  if (comunicados.length === 0) return null

  return (
    <div className="rounded-[16px] border border-outline-variant/15 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-outline-variant/10 p-4 sm:px-5 sm:py-4">
        <span
          className="material-symbols-outlined text-[20px] text-on-surface-variant"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          campaign
        </span>
        <h2 className="font-headline text-[14px] font-semibold text-on-surface">Comunicados do escritório</h2>
      </div>
      <ul className="divide-y divide-outline-variant/8">
        {comunicados.map(c => (
          <li key={c.id}>
            <Link
              href={`/portal/comunicados/${c.id}`}
              className="flex items-center gap-3 p-4 sm:px-5 sm:py-3.5 hover:bg-surface-container/50 transition-colors"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/8">
                <span
                  className="material-symbols-outlined text-[16px] text-primary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {TIPO_ICON[c.tipo] ?? 'campaign'}
                </span>
              </div>
              <p className="flex-1 min-w-0 text-[13px] font-medium text-on-surface truncate">{c.titulo}</p>
              {c.publicadoEm && (
                <span className="shrink-0 text-[11px] text-on-surface-variant/50">
                  {new Date(c.publicadoEm).toLocaleDateString('pt-BR')}
                </span>
              )}
              <span className="material-symbols-outlined shrink-0 text-[16px] text-on-surface-variant/40">
                chevron_right
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="border-t border-outline-variant/8 px-5 py-3 text-right">
        <Link href="/portal/suporte" className="text-[12px] font-semibold text-primary hover:underline">
          Ver todos os comunicados →
        </Link>
      </div>
    </div>
  )
}
