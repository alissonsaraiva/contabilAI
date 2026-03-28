import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { RelatoriosClient } from './relatorios-client'

type Props = {
  searchParams: Promise<{
    q?: string
    tipo?: string
    sucesso?: string
    agendamentoId?: string
    ano?: string
    mes?: string
    page?: string
  }>
}

const PER_PAGE = 20

export default async function RelatoriosPage({ searchParams }: Props) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp           = await searchParams
  const q            = sp.q?.trim() ?? ''
  const tipo         = sp.tipo ?? ''
  const sucessoParam = sp.sucesso ?? ''
  const agendamentoId = sp.agendamentoId ?? ''
  const ano          = sp.ano  ? parseInt(sp.ano)  : null
  const mes          = sp.mes  ? parseInt(sp.mes)  : null
  const page         = Math.max(1, parseInt(sp.page ?? '1'))
  const skip         = (page - 1) * PER_PAGE

  let dateFrom: Date | undefined
  let dateTo:   Date | undefined
  if (ano && mes) {
    dateFrom = new Date(ano, mes - 1, 1)
    dateTo   = new Date(ano, mes, 1)
  } else if (ano) {
    dateFrom = new Date(ano, 0, 1)
    dateTo   = new Date(ano + 1, 0, 1)
  }

  const where: any = {
    AND: [
      q ? { OR: [
        { titulo:        { contains: q, mode: 'insensitive' } },
        { conteudo:      { contains: q, mode: 'insensitive' } },
        { criadoPorNome: { contains: q, mode: 'insensitive' } },
        { agendamentoDesc: { contains: q, mode: 'insensitive' } },
      ]} : {},
      tipo          ? { tipo }        : {},
      agendamentoId ? { agendamentoId } : {},
      sucessoParam === 'true'  ? { sucesso: true }  : {},
      sucessoParam === 'false' ? { sucesso: false }  : {},
      dateFrom ? { criadoEm: { gte: dateFrom } } : {},
      dateTo   ? { criadoEm: { lt:  dateTo   } } : {},
    ],
  }

  const [relatorios, total, totalGeral, agendamentos] = await Promise.all([
    prisma.relatorioAgente.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip,
      take: PER_PAGE,
    }),
    prisma.relatorioAgente.count({ where }),
    prisma.relatorioAgente.count(),
    // Agendamentos únicos para o filtro
    prisma.relatorioAgente.findMany({
      where: { agendamentoId: { not: null } },
      select: { agendamentoId: true, agendamentoDesc: true },
      distinct: ['agendamentoId'],
      orderBy: { criadoEm: 'desc' },
    }),
  ])

  // Anos disponíveis
  const todosAnos = await prisma.relatorioAgente.findMany({
    select: { criadoEm: true },
    orderBy: { criadoEm: 'asc' },
  })
  const anos = [...new Set(todosAnos.map(r => new Date(r.criadoEm).getFullYear()))].sort((a, b) => b - a)

  const totalPages = Math.ceil(total / PER_PAGE)

  // Stats rápidas
  const [totalAgendados, totalManuais, totalErros] = await Promise.all([
    prisma.relatorioAgente.count({ where: { tipo: 'agendado' } }),
    prisma.relatorioAgente.count({ where: { tipo: 'manual' } }),
    prisma.relatorioAgente.count({ where: { sucesso: false } }),
  ])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-on-surface">Relatórios</h1>
          <p className="mt-1 text-sm text-on-surface-variant/70">
            Relatórios gerados pela IA — agendados e manuais.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Stats rápidas */}
          <div className="hidden sm:flex items-center gap-4 rounded-xl border border-outline-variant/15 bg-card px-4 py-2.5 text-[12px]">
            <span className="text-on-surface-variant">
              <span className="font-bold text-on-surface">{totalGeral}</span> total
            </span>
            <span className="h-4 w-px bg-outline-variant/20" />
            <span className="text-on-surface-variant">
              <span className="font-bold text-primary">{totalAgendados}</span> agendados
            </span>
            <span className="h-4 w-px bg-outline-variant/20" />
            <span className="text-on-surface-variant">
              <span className="font-bold text-tertiary">{totalManuais}</span> manuais
            </span>
            {totalErros > 0 && (
              <>
                <span className="h-4 w-px bg-outline-variant/20" />
                <span className="text-on-surface-variant">
                  <span className="font-bold text-error">{totalErros}</span> com erro
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <RelatoriosClient
        relatorios={relatorios.map(r => ({
          ...r,
          criadoEm: r.criadoEm.toISOString(),
        }))}
        total={total}
        page={page}
        totalPages={totalPages}
        anos={anos}
        agendamentos={agendamentos.map(a => ({ id: a.agendamentoId!, desc: a.agendamentoDesc ?? '' }))}
        filters={{ q, tipo, sucesso: sucessoParam, agendamentoId, ano: sp.ano ?? '', mes: sp.mes ?? '' }}
      />
    </div>
  )
}
