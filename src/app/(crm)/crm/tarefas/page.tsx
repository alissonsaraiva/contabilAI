import { prisma } from '@/lib/prisma'
import { formatDate } from '@/lib/utils'
import type { Prioridade } from '@prisma/client'
import { NovaTarefaDrawer } from '@/components/crm/nova-tarefa-drawer'
import { ConcluirTarefaBtn } from '@/components/crm/concluir-tarefa-btn'
import { EditarTarefaDrawer } from '@/components/crm/editar-tarefa-drawer'
import Link from 'next/link'

const PRIORIDADE_CONFIG: Record<Prioridade, { label: string; badge: string; bar: string }> = {
  baixa: { label: 'Baixa', badge: 'bg-surface-container-low text-on-surface-variant', bar: 'bg-on-surface-variant/30' },
  media: { label: 'Média', badge: 'bg-primary/10 text-primary', bar: 'bg-primary' },
  alta: { label: 'Alta', badge: 'bg-orange-status/10 text-orange-status', bar: 'bg-orange-status' },
  urgente: { label: 'Urgente', badge: 'bg-error/10 text-error', bar: 'bg-error' },
}

function isOverdue(prazo: Date | null) {
  if (!prazo) return false
  return new Date(prazo) < new Date()
}

function isToday(prazo: Date | null) {
  if (!prazo) return false
  const d = new Date(prazo)
  const now = new Date()
  return d.toDateString() === now.toDateString()
}

type Props = { searchParams: Promise<{ filtro?: string }> }

export default async function TarefasPage({ searchParams }: Props) {
  const { filtro } = await searchParams

  const hoje = new Date()
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const fimHoje = new Date(inicioHoje.getTime() + 86400000)

  const whereExtra =
    filtro === 'pendentes' ? { status: 'pendente' as const } :
    filtro === 'hoje' ? { prazo: { gte: inicioHoje, lt: fimHoje } } :
    {}

  const [tarefas, clientes] = await Promise.all([
    prisma.tarefa.findMany({
      where: { status: { notIn: ['concluida', 'cancelada'] }, ...whereExtra },
      orderBy: [{ prioridade: 'desc' }, { prazo: 'asc' }],
      include: {
        responsavel: { select: { nome: true } },
        cliente: { select: { nome: true } },
      },
    }),
    prisma.cliente.findMany({
      where: { status: 'ativo' },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
  ])

  const concluidas = await prisma.tarefa.count({
    where: {
      status: 'concluida',
      atualizadoEm: { gte: new Date(new Date().setDate(1)) },
    },
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex gap-2 rounded-full border border-outline-variant/15 bg-surface-container-low p-1.5 shadow-sm">
          {[
            { href: '/crm/tarefas', label: 'Todas', key: undefined },
            { href: '/crm/tarefas?filtro=pendentes', label: 'Pendentes', key: 'pendentes' },
            { href: '/crm/tarefas?filtro=hoje', label: 'Hoje', key: 'hoje' },
          ].map(tab => {
            const ativo = filtro === tab.key
            return (
              <Link
                key={tab.label}
                href={tab.href}
                className={`rounded-full px-5 py-2 text-[13px] font-medium transition-all
                  ${ativo
                    ? 'bg-card font-semibold text-primary shadow-sm ring-1 ring-outline-variant/10'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-outline-variant/5'
                  }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
        <div className="flex items-center gap-8">
          <div className="text-right">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              Ativas
            </span>
            <div className="flex items-baseline gap-1.5 justify-end mt-0.5">
              <span className="text-3xl font-semibold tracking-tight text-on-surface leading-none">{tarefas.length}</span>
              <span className="text-xs font-medium text-on-surface-variant/80">tarefas</span>
            </div>
          </div>
          <div className="h-10 w-px bg-outline-variant/20" />
          <div className="text-right">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              Concluídas
            </span>
            <div className="flex items-baseline gap-1.5 justify-end mt-0.5">
              <span className="text-3xl font-semibold tracking-tight text-green-status/90 leading-none">{concluidas}</span>
              <span className="text-xs font-medium text-on-surface-variant/80">este mês</span>
            </div>
          </div>
          <div className="ml-2">
            <NovaTarefaDrawer clientes={clientes} />
          </div>
        </div>
      </div>

      {/* Task cards */}
      {tarefas.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-outline-variant/40 py-16 text-center">
          <p className="text-sm text-on-surface-variant">Nenhuma tarefa pendente</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {tarefas.map((t) => {
            const cfg = PRIORIDADE_CONFIG[t.prioridade]
            const overdue = isOverdue(t.prazo)
            const today = isToday(t.prazo)
            const tarefaSerial = {
              id: t.id,
              titulo: t.titulo,
              descricao: t.descricao,
              prioridade: t.prioridade,
              prazo: t.prazo ? t.prazo.toISOString() : null,
              clienteId: t.clienteId,
              cliente: t.cliente,
            }
            return (
              <EditarTarefaDrawer key={t.id} tarefa={tarefaSerial} clientes={clientes}>
                <div className="group relative cursor-pointer overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-5 shadow-sm transition-all hover:bg-surface-container-low/30 hover:border-outline-variant/30">
                  {/* Left color bar */}
                  <div className={`absolute left-0 top-0 h-full w-1 ${overdue ? 'bg-error' : cfg.bar}`} />

                  <div className="flex gap-4">
                    <ConcluirTarefaBtn tarefaId={t.id} />

                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-start justify-between gap-3">
                        <h3 className="text-[14px] font-semibold text-on-surface group-hover:text-primary transition-colors leading-snug">{t.titulo}</h3>
                        {overdue ? (
                          <span className="shrink-0 rounded-md bg-error/10 border border-error/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-error">
                            Vencida
                          </span>
                        ) : (
                          <span className={`shrink-0 rounded-md border border-outline-variant/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                        )}
                      </div>
                      {t.descricao && (
                        <p className="mb-4 text-[13px] leading-relaxed text-on-surface-variant/90 line-clamp-2">
                          {t.descricao}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        {t.cliente && (
                          <div className="flex items-center gap-1.5 rounded-md bg-surface-container-low border border-outline-variant/20 px-2 py-1 text-[11px] font-medium tracking-wide text-on-surface-variant/90">
                            <span className="material-symbols-outlined text-[13px] opacity-70">business</span>
                            {t.cliente.nome}
                          </div>
                        )}
                        {t.prazo && (
                          <div className={`flex items-center gap-1.5 rounded-md border border-outline-variant/20 px-2 py-1 text-[11px] font-medium tracking-wide ${overdue ? 'bg-error/10 text-error border-error/20' : today ? 'bg-orange-status/10 text-orange-status border-orange-status/20' : 'bg-surface-container-low text-on-surface-variant/90'}`}>
                            <span className="material-symbols-outlined text-[13px] opacity-70">
                              {overdue ? 'event_busy' : 'schedule'}
                            </span>
                            {formatDate(t.prazo)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </EditarTarefaDrawer>
            )
          })}
        </div>
      )}
    </div>
  )
}
