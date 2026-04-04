import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Suspense } from 'react'
import { NovoChamadoDrawer } from '@/components/crm/novo-chamado-drawer'
import { ChamadosSearchBar } from '@/components/crm/chamados-search-bar'
import { ChamadosPaginacao } from '@/components/crm/chamados-paginacao'

const PER_PAGE = 30

type Props = {
  searchParams: Promise<{
    page?:       string
    q?:          string
    status?:     string
    tipo?:       string
    prioridade?: string
  }>
}

const STATUS_CHAMADO: Record<string, { label: string; color: string; icon: string }> = {
  aberta:              { label: 'Aberta',            color: 'text-blue-600 bg-blue-500/10',                    icon: 'radio_button_unchecked' },
  em_andamento:        { label: 'Em andamento',      color: 'text-primary bg-primary/10',                      icon: 'autorenew' },
  aguardando_cliente:  { label: 'Aguardando',        color: 'text-yellow-600 bg-yellow-500/10',                icon: 'pending' },
  resolvida:           { label: 'Resolvida',         color: 'text-green-status bg-green-status/10',            icon: 'task_alt' },
  cancelada:           { label: 'Cancelada',         color: 'text-on-surface-variant/50 bg-surface-container', icon: 'cancel' },
}

const TIPO_CHAMADO: Record<string, string> = {
  duvida: 'Dúvida', solicitacao: 'Solicitação', reclamacao: 'Reclamação',
  documento: 'Documento', emissao_documento: 'Emissão', correcao_documento: 'Correção',
  solicitacao_documento: 'Solicitar doc.', tarefa_interna: 'Interna', outros: 'Outros',
}

const PRIORIDADE: Record<string, string> = {
  baixa: 'text-on-surface-variant/50', media: 'text-blue-600', alta: 'text-yellow-600', urgente: 'text-error',
}

function StarsInline({ nota }: { nota: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          className={`material-symbols-outlined text-[10px] ${i <= nota ? 'text-amber-400' : 'text-on-surface-variant/20'}`}
          style={{ fontVariationSettings: i <= nota ? "'FILL' 1" : "'FILL' 0" }}
        >
          star
        </span>
      ))}
    </span>
  )
}

export default async function CrmChamadosPage({ searchParams }: Props) {
  const session = await auth()
  if (!session) redirect('/crm/login')

  const sp         = await searchParams
  const page       = Math.max(1, parseInt(sp.page ?? '1'))
  const q          = (sp.q ?? '').trim()
  const status     = sp.status     as string | undefined
  const tipo       = sp.tipo       as string | undefined
  const prioridade = sp.prioridade as string | undefined
  const skip       = (page - 1) * PER_PAGE

  // ── Cláusula de busca textual ──────────────────────────────────────────────
  // Se o termo começa com # ou é puramente numérico → busca por numero exato
  // Caso contrário → OR em título, cliente.nome, empresa.razaoSocial/nomeFantasia
  let searchWhere: any = {}
  if (q) {
    const numeroMatch = q.replace(/^#/, '').trim()
    const isNumero    = /^\d+$/.test(numeroMatch)

    if (isNumero) {
      searchWhere = { numero: parseInt(numeroMatch, 10) }
    } else {
      searchWhere = {
        OR: [
          { titulo:  { contains: q, mode: 'insensitive' } },
          { cliente: { nome:       { contains: q, mode: 'insensitive' } } },
          { empresa: { razaoSocial: { contains: q, mode: 'insensitive' } } },
          { empresa: { nomeFantasia: { contains: q, mode: 'insensitive' } } },
        ],
      }
    }
  }

  const where: any = {
    AND: [
      searchWhere,
      status     ? { status }     : {},
      tipo       ? { tipo }       : {},
      prioridade ? { prioridade } : {},
    ],
  }

  const [ordens, total, counts, clientes, avalStats, avalDist] = await Promise.all([
    prisma.chamado.findMany({
      where,
      orderBy: [{ prioridade: 'desc' }, { criadoEm: 'desc' }],
      skip,
      take:    PER_PAGE,
      include: {
        cliente: { select: { nome: true } },
        empresa: { select: { razaoSocial: true, nomeFantasia: true } },
      },
    }),
    prisma.chamado.count({ where }),
    // Contagens de status sempre sem filtros de busca (para os badges do search bar)
    prisma.chamado.groupBy({ by: ['status'], _count: { status: true } }),
    prisma.cliente.findMany({
      where:   { status: 'ativo' },
      select:  { id: true, nome: true },
      orderBy: { nome: 'asc' },
    }),
    prisma.chamado.aggregate({
      where:  { avaliacaoNota: { not: null } },
      _avg:   { avaliacaoNota: true },
      _count: { id: true },
    }),
    prisma.chamado.groupBy({
      by:      ['avaliacaoNota'],
      where:   { avaliacaoNota: { not: null } },
      _count:  { id: true },
      orderBy: { avaliacaoNota: 'desc' },
    }),
  ])

  const totalPages      = Math.ceil(total / PER_PAGE)
  const mediaAvaliacao  = avalStats._avg.avaliacaoNota
  const totalAvaliados  = avalStats._count.id
  const totalResolvidas = counts.find(c => c.status === 'resolvida')?._count.status ?? 0
  const distMap         = Object.fromEntries(avalDist.map(d => [d.avaliacaoNota ?? 0, d._count.id]))
  const hasFilters      = !!(q || status || tipo || prioridade)

  return (
    <div className="space-y-6 p-6 md:p-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-on-surface">Chamados</h1>
          <p className="text-sm text-on-surface-variant/70 mt-0.5">
            Solicitações abertas pelos clientes via portal.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-on-surface-variant">{total} chamado{total !== 1 ? 's' : ''}</span>
          <NovoChamadoDrawer clientes={clientes} />
        </div>
      </div>

      {/* Painel de avaliações */}
      {totalResolvidas > 0 && (
        <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
          <div className="flex flex-wrap items-center gap-6">

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10">
                <span className="material-symbols-outlined text-[20px] text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50">Média de avaliação</p>
                <p className="text-[20px] font-bold text-on-surface leading-none">
                  {mediaAvaliacao != null ? mediaAvaliacao.toFixed(1) : '—'}
                  <span className="text-[12px] font-normal text-on-surface-variant/50 ml-1">/ 5</span>
                </p>
              </div>
            </div>

            {totalAvaliados > 0 && (
              <div className="flex items-end gap-1">
                {[5, 4, 3, 2, 1].map(n => {
                  const count = distMap[n] ?? 0
                  const pct   = Math.round((count / totalAvaliados) * 100)
                  return (
                    <div key={n} title={`${n}★: ${count}`} className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] font-semibold text-on-surface-variant/50">{count > 0 ? count : ''}</span>
                      <div className="relative w-4 h-8 rounded-sm bg-surface-container overflow-hidden">
                        <div className="absolute bottom-0 w-full rounded-sm bg-amber-400/70" style={{ height: `${pct}%` }} />
                      </div>
                      <span className="text-[9px] text-on-surface-variant/40">{n}★</span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="ml-auto text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50">Avaliados</p>
              <p className="text-[16px] font-bold text-on-surface leading-none">
                {totalAvaliados}
                <span className="text-[12px] font-normal text-on-surface-variant/50"> / {totalResolvidas}</span>
              </p>
              {totalResolvidas - totalAvaliados > 0 && (
                <p className="text-[11px] text-on-surface-variant/50 mt-0.5">
                  {totalResolvidas - totalAvaliados} aguardando
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Barra de busca e filtros */}
      <Suspense>
        <ChamadosSearchBar />
      </Suspense>

      {/* Resultado vazio */}
      {ordens.length === 0 ? (
        <Card className="border-outline-variant/15 bg-card/60 p-10 rounded-[16px] shadow-sm flex flex-col items-center gap-3 text-center">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant/25">
            {hasFilters ? 'search_off' : 'inbox'}
          </span>
          <p className="text-[14px] font-medium text-on-surface-variant/60">
            {hasFilters
              ? 'Nenhum chamado encontrado para essa busca.'
              : 'Nenhum chamado cadastrado.'}
          </p>
          {hasFilters && (
            <Link
              href="/crm/chamados"
              className="text-[13px] text-primary hover:underline"
            >
              Limpar filtros
            </Link>
          )}
        </Card>
      ) : (
        <Card className="border-outline-variant/15 bg-card/60 rounded-[16px] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/10">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50 w-[60px]">#</th>
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
                  const s           = STATUS_CHAMADO[o.status] ?? STATUS_CHAMADO.aberta
                  const nomeEmpresa = o.empresa?.razaoSocial ?? o.empresa?.nomeFantasia ?? ''
                  const prioClass   = PRIORIDADE[o.prioridade] ?? 'text-on-surface-variant/50'
                  return (
                    <tr key={o.id} className="border-b border-outline-variant/10 hover:bg-surface-container/40 transition-colors">
                      <td className="px-4 py-3.5 text-[12px] font-mono text-on-surface-variant/50 tabular-nums">
                        #{o.numero}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className={`material-symbols-outlined text-[14px] shrink-0 ${prioClass}`} style={{ fontVariationSettings: "'FILL' 1" }}>circle</span>
                          <p className="text-[13px] font-medium text-on-surface truncate max-w-[200px]">{o.titulo}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <p className="text-[13px] text-on-surface">{o.cliente.nome}</p>
                        {nomeEmpresa && <p className="text-[11px] text-on-surface-variant/60">{nomeEmpresa}</p>}
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <span className="text-[12px] text-on-surface-variant">{TIPO_CHAMADO[o.tipo] ?? o.tipo}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.color}`}>
                          {s.label}
                        </span>
                        {o.status === 'resolvida' && o.avaliacaoNota != null && (
                          <div className="mt-0.5"><StarsInline nota={o.avaliacaoNota} /></div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <span className="text-[12px] text-on-surface-variant/60">
                          {new Date(o.criadoEm).toLocaleDateString('pt-BR')}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/crm/chamados/${o.id}`}
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

      {/* Paginação */}
      {totalPages > 1 && (
        <Suspense>
          <ChamadosPaginacao
            page={page}
            totalPages={totalPages}
            total={total}
            perPage={PER_PAGE}
          />
        </Suspense>
      )}

    </div>
  )
}
