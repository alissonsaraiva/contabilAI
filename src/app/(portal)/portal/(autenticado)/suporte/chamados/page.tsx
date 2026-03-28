import { auth } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { Card } from '@/components/ui/card'
import Link from 'next/link'

const PER_PAGE = 20

type Props = { searchParams: Promise<{ page?: string; status?: string }> }

const STATUS_OS: Record<string, { label: string; color: string; icon: string }> = {
  aberta:              { label: 'Aberta',            color: 'text-blue-600 bg-blue-500/10',    icon: 'radio_button_unchecked' },
  em_andamento:        { label: 'Em andamento',      color: 'text-primary bg-primary/10',      icon: 'autorenew' },
  aguardando_cliente:  { label: 'Aguardando você',   color: 'text-yellow-600 bg-yellow-500/10',icon: 'pending' },
  resolvida:           { label: 'Resolvida',         color: 'text-green-status bg-green-status/10', icon: 'task_alt' },
  cancelada:           { label: 'Cancelada',         color: 'text-on-surface-variant/50 bg-surface-container', icon: 'cancel' },
}

const TIPO_OS: Record<string, string> = {
  duvida: 'Dúvida', solicitacao: 'Solicitação', reclamacao: 'Reclamação', documento: 'Documento', outros: 'Outros',
}

export default async function ChamadosPage({ searchParams }: Props) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) redirect('/portal/login')

  const clienteId = await resolveClienteId(user)
  if (!clienteId) redirect('/portal/login')

  const sp     = await searchParams
  const page   = Math.max(1, parseInt(sp.page ?? '1'))
  const status = sp.status
  const skip   = (page - 1) * PER_PAGE

  const where: any = { clienteId }
  if (status) where.status = status

  const [ordens, total] = await Promise.all([
    prisma.ordemServico.findMany({ where, orderBy: { criadoEm: 'desc' }, skip, take: PER_PAGE }),
    prisma.ordemServico.count({ where }),
  ])

  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/portal/suporte"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </Link>
        <div>
          <h1 className="font-headline text-xl font-semibold text-on-surface">Meus chamados</h1>
          <p className="text-[12px] text-on-surface-variant/60">{total} chamado{total !== 1 ? 's' : ''} no total</p>
        </div>
        <Link
          href="/portal/suporte/os/nova"
          className="ml-auto flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[12px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Novo
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {[undefined, 'aberta', 'em_andamento', 'aguardando_cliente', 'resolvida', 'cancelada'].map(s => (
          <a
            key={s ?? 'todos'}
            href={s ? `?status=${s}` : '/portal/suporte/chamados'}
            className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
              status === s || (!status && !s)
                ? 'bg-primary text-white'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {s ? STATUS_OS[s]?.label : 'Todos'}
          </a>
        ))}
      </div>

      {ordens.length === 0 ? (
        <Card className="border-outline-variant/15 bg-card/60 p-10 rounded-[16px] shadow-sm flex flex-col items-center gap-3 text-center">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant/25">inbox</span>
          <p className="text-[14px] text-on-surface-variant/60">Nenhum chamado encontrado.</p>
        </Card>
      ) : (
        <Card className="border-outline-variant/15 bg-card/60 rounded-[16px] shadow-sm overflow-hidden">
          <ul className="divide-y divide-outline-variant/10">
            {ordens.map(o => {
              const s = STATUS_OS[o.status] ?? STATUS_OS.aberta
              return (
                <li key={o.id}>
                  <Link
                    href={`/portal/suporte/os/${o.id}`}
                    className="flex items-start gap-3 px-5 py-3.5 hover:bg-surface-container/50 transition-colors"
                  >
                    <span
                      className={`material-symbols-outlined mt-0.5 text-[18px] shrink-0 ${s.color.split(' ')[0]}`}
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      {s.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-on-surface truncate">{o.titulo}</p>
                      <p className="text-[11px] text-on-surface-variant/60">
                        {TIPO_OS[o.tipo] ?? o.tipo} · {new Date(o.criadoEm).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.color}`}>
                      {s.label}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-on-surface-variant">Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={`?page=${page - 1}${status ? `&status=${status}` : ''}`}
                className="rounded-lg border border-outline-variant px-3 py-1.5 text-on-surface hover:bg-surface-container transition-colors">
                ← Anterior
              </a>
            )}
            {page < totalPages && (
              <a href={`?page=${page + 1}${status ? `&status=${status}` : ''}`}
                className="rounded-lg border border-outline-variant px-3 py-1.5 text-on-surface hover:bg-surface-container transition-colors">
                Próxima →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
