import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { NovaOSDrawer } from '@/components/crm/nova-os-drawer'

const PER_PAGE = 30

type Props = { searchParams: Promise<{ page?: string; status?: string }> }

const STATUS_OS: Record<string, { label: string; color: string; icon: string }> = {
  aberta:              { label: 'Aberta',            color: 'text-blue-600 bg-blue-500/10',    icon: 'radio_button_unchecked' },
  em_andamento:        { label: 'Em andamento',      color: 'text-primary bg-primary/10',      icon: 'autorenew' },
  aguardando_cliente:  { label: 'Aguardando cliente',color: 'text-yellow-600 bg-yellow-500/10',icon: 'pending' },
  resolvida:           { label: 'Resolvida',         color: 'text-green-status bg-green-status/10', icon: 'task_alt' },
  cancelada:           { label: 'Cancelada',         color: 'text-on-surface-variant/50 bg-surface-container', icon: 'cancel' },
}

const TIPO_OS: Record<string, string> = {
  duvida: 'Dúvida', solicitacao: 'Solicitação', reclamacao: 'Reclamação', documento: 'Documento', outros: 'Outros',
}

const PRIORIDADE: Record<string, string> = {
  baixa: 'text-on-surface-variant/50', media: 'text-blue-600', alta: 'text-yellow-600', urgente: 'text-error',
}

export default async function CrmOrdensServicoPage({ searchParams }: Props) {
  const session = await auth()
  if (!session) redirect('/crm/login')

  const sp     = await searchParams
  const page   = Math.max(1, parseInt(sp.page ?? '1'))
  const status = sp.status as string | undefined
  const skip   = (page - 1) * PER_PAGE

  const where: any = {}
  if (status) where.status = status

  const [ordens, total, counts, clientes] = await Promise.all([
    prisma.ordemServico.findMany({
      where,
      orderBy: [{ prioridade: 'desc' }, { criadoEm: 'desc' }],
      skip,
      take:    PER_PAGE,
      include: {
        cliente: { select: { nome: true } },
        empresa: { select: { razaoSocial: true, nomeFantasia: true } },
      },
    }),
    prisma.ordemServico.count({ where }),
    prisma.ordemServico.groupBy({
      by:    ['status'],
      _count: { status: true },
    }),
    prisma.cliente.findMany({
      where:   { status: 'ativo' },
      select:  { id: true, nome: true },
      orderBy: { nome: 'asc' },
    }),
  ])

  const totalPages   = Math.ceil(total / PER_PAGE)
  const statusCounts = Object.fromEntries(counts.map(c => [c.status, c._count.status]))

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-on-surface">Chamados</h1>
          <p className="text-sm text-on-surface-variant/70 mt-0.5">
            Solicitações abertas pelos clientes via portal.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-on-surface-variant">{total} chamado{total !== 1 ? 's' : ''}</span>
          <NovaOSDrawer clientes={clientes} />
        </div>
      </div>

      {/* Status counts */}
      <div className="flex flex-wrap gap-2">
        {[undefined, 'aberta', 'em_andamento', 'aguardando_cliente', 'resolvida', 'cancelada'].map(s => {
          const count = s ? (statusCounts[s] ?? 0) : total
          return (
            <a
              key={s ?? 'todos'}
              href={s ? `?status=${s}` : '/crm/ordens-servico'}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                status === s || (!status && !s)
                  ? 'bg-primary text-white'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {s ? STATUS_OS[s]?.label : 'Todos'}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${status === s || (!status && !s) ? 'bg-white/20 text-white' : 'bg-outline-variant/20 text-on-surface-variant'}`}>
                {count}
              </span>
            </a>
          )
        })}
      </div>

      {ordens.length === 0 ? (
        <Card className="border-outline-variant/15 bg-card/60 p-10 rounded-[16px] shadow-sm flex flex-col items-center gap-3 text-center">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant/25">inbox</span>
          <p className="text-[14px] font-medium text-on-surface-variant/60">Nenhum chamado encontrado.</p>
        </Card>
      ) : (
        <Card className="border-outline-variant/15 bg-card/60 rounded-[16px] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/10">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50">Chamado</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50 hidden md:table-cell">Cliente / Empresa</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50 hidden md:table-cell">Tipo</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50">Status</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50 hidden lg:table-cell">Data</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {ordens.map(o => {
                  const s         = STATUS_OS[o.status] ?? STATUS_OS.aberta
                  const nomeEmpresa = o.empresa?.razaoSocial ?? o.empresa?.nomeFantasia ?? ''
                  const prioClass   = PRIORIDADE[o.prioridade] ?? 'text-on-surface-variant/50'
                  return (
                    <tr key={o.id} className="border-b border-outline-variant/10 hover:bg-surface-container/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className={`material-symbols-outlined text-[14px] ${prioClass}`} style={{ fontVariationSettings: "'FILL' 1" }}>circle</span>
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-on-surface truncate max-w-[200px]">{o.titulo}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <p className="text-[13px] text-on-surface">{o.cliente.nome}</p>
                        {nomeEmpresa && <p className="text-[11px] text-on-surface-variant/60">{nomeEmpresa}</p>}
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <span className="text-[12px] text-on-surface-variant">{TIPO_OS[o.tipo] ?? o.tipo}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.color}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <span className="text-[12px] text-on-surface-variant/60">
                          {new Date(o.criadoEm).toLocaleDateString('pt-BR')}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/crm/ordens-servico/${o.id}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/60 hover:bg-surface-container hover:text-primary transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
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
