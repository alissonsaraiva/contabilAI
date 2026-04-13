import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { TipoComunicado, Prisma } from '@prisma/client'
import { Card } from '@/components/ui/card'
import { ComunicadoForm } from '@/components/crm/comunicado-form'
import { ComunicadoPublishButton, ComunicadoUnpublishButton, ComunicadoDeleteButton } from '@/components/crm/comunicado-buttons'
import { ComunicadosFiltros } from '@/components/crm/comunicados-filtros'
import { ComunicadosPaginacao } from '@/components/crm/comunicados-paginacao'

const TIPO_COM: Record<TipoComunicado, { label: string; color: string; icon: string }> = {
  informativo: { label: 'Informativo', color: 'text-blue-600 bg-blue-500/10',              icon: 'info' },
  alerta:      { label: 'Alerta',      color: 'text-yellow-600 bg-yellow-500/10',           icon: 'warning' },
  obrigacao:   { label: 'Obrigação',   color: 'text-error bg-error/10',                     icon: 'event_busy' },
  promocional: { label: 'Promoção',    color: 'text-green-status bg-green-status/10',       icon: 'campaign' },
}

const TIPOS_VALIDOS = Object.values(TipoComunicado)
const POR_PAGINA   = 20

type Secao = 'ativos' | 'expirados' | 'rascunhos'

type Props = {
  searchParams: Promise<{
    secao?:  string
    tipo?:   string
    busca?:  string
    pagina?: string
  }>
}

export default async function CrmComunicadosPage({ searchParams }: Props) {
  const session = await auth()
  if (!session) redirect('/crm/login')

  const { secao: secaoParam, tipo: tipoParam, busca, pagina: paginaParam } = await searchParams

  const secao:   Secao          = (secaoParam === 'expirados' || secaoParam === 'rascunhos') ? secaoParam : 'ativos'
  const tipo:    TipoComunicado | undefined = TIPOS_VALIDOS.includes(tipoParam as TipoComunicado) ? tipoParam as TipoComunicado : undefined
  const paginaNum = parseInt(paginaParam ?? '1', 10)
  const pagina:  number         = isNaN(paginaNum) ? 1 : Math.max(1, paginaNum)
  const skip:    number         = (pagina - 1) * POR_PAGINA
  const agora:   Date           = new Date()

  const whereAtivos:    Prisma.ComunicadoWhereInput = { publicado: true, OR: [{ expiradoEm: null }, { expiradoEm: { gte: agora } }] }
  const whereExpirados: Prisma.ComunicadoWhereInput = { publicado: true, expiradoEm: { lt: agora } }
  const whereRascunhos: Prisma.ComunicadoWhereInput = { publicado: false }

  const whereBase: Prisma.ComunicadoWhereInput =
    secao === 'expirados' ? whereExpirados :
    secao === 'rascunhos' ? whereRascunhos :
    whereAtivos

  const whereFiltrado: Prisma.ComunicadoWhereInput = {
    ...whereBase,
    ...(tipo  ? { tipo }  : {}),
    ...(busca ? { titulo: { contains: busca, mode: 'insensitive' } } : {}),
  }

  const [comunicados, total, totalAtivos, totalExpirados, totalRascunhos] = await Promise.all([
    prisma.comunicado.findMany({
      where:   whereFiltrado,
      orderBy: { criadoEm: 'desc' },
      skip,
      take:    POR_PAGINA,
      include: { _count: { select: { envios: true } } },
    }),
    prisma.comunicado.count({ where: whereFiltrado }),
    prisma.comunicado.count({ where: whereAtivos }),
    prisma.comunicado.count({ where: whereExpirados }),
    prisma.comunicado.count({ where: whereRascunhos }),
  ])

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  // Agrupa por ano
  const porAno = comunicados.reduce<Record<string, typeof comunicados>>((acc, c) => {
    const ano = String(new Date(c.criadoEm).getFullYear())
    const arr = acc[ano]
    if (arr) arr.push(c)
    else acc[ano] = [c]
    return acc
  }, {})
  const anos = Object.keys(porAno).sort((a, b) => Number(b) - Number(a))

  const secaoLabel =
    secao === 'expirados' ? 'Expirados' :
    secao === 'rascunhos' ? 'Rascunhos' :
    'Publicados'

  return (
    <div className="space-y-6 p-6 md:p-8">
      {/* Header */}
      <div>
        <h1 className="font-headline text-2xl font-semibold text-on-surface">Comunicados</h1>
        <p className="mt-0.5 text-sm text-on-surface-variant/70">
          Publique comunicados visíveis no portal de todos os clientes.
        </p>
      </div>

      {/* Novo comunicado */}
      <ComunicadoForm />

      {/* Filtros + tabs */}
      <ComunicadosFiltros
        totalAtivos={totalAtivos}
        totalExpirados={totalExpirados}
        totalRascunhos={totalRascunhos}
      />

      {/* Lista */}
      {comunicados.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 rounded-[16px] border-outline-variant/15 bg-card/60 p-10 text-center shadow-sm">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant/25">campaign</span>
          <p className="text-[14px] font-medium text-on-surface-variant/60">
            Nenhum comunicado em <span className="lowercase">{secaoLabel}</span>
            {(tipo ?? busca) ? ' com esses filtros' : ''}.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {anos.map(ano => {
            const items = porAno[ano]
            if (!items || items.length === 0) return null

            return (
              <div key={ano}>
                {/* Separador de ano */}
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-[12px] font-bold uppercase tracking-widest text-on-surface-variant/40">
                    {ano}
                  </span>
                  <div className="h-px flex-1 bg-outline-variant/15" />
                </div>

                <div className="space-y-3">
                  {items.map(c => {
                    const tc       = TIPO_COM[c.tipo]
                    const expirado = c.expiradoEm && new Date(c.expiradoEm) < agora
                    const alcance  = c._count.envios

                    return (
                      <Card
                        key={c.id}
                        className={`rounded-[16px] border-outline-variant/15 bg-card/60 p-4 shadow-sm transition-opacity ${expirado ? 'opacity-60' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`material-symbols-outlined mt-0.5 shrink-0 text-[20px] ${tc.color.split(' ')[0] ?? ''}`}
                            style={{ fontVariationSettings: secao === 'rascunhos' ? "'FILL' 0" : "'FILL' 1" }}
                          >
                            {tc.icon}
                          </span>

                          <div className="min-w-0 flex-1">
                            {/* Título + ações */}
                            <div className="mb-1 flex items-start justify-between gap-2">
                              <p className="text-[13px] font-semibold text-on-surface">{c.titulo}</p>
                              <div className="flex shrink-0 items-center gap-2">
                                {expirado && (
                                  <span className="rounded-full bg-on-surface-variant/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant/50">
                                    Expirado
                                  </span>
                                )}
                                {secao === 'rascunhos' && (
                                  <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant/50">
                                    Rascunho
                                  </span>
                                )}
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tc.color}`}>
                                  {tc.label}
                                </span>
                                {secao === 'rascunhos' ? (
                                  <>
                                    <ComunicadoPublishButton id={c.id} />
                                    <ComunicadoDeleteButton  id={c.id} />
                                  </>
                                ) : (
                                  <ComunicadoUnpublishButton id={c.id} />
                                )}
                              </div>
                            </div>

                            {/* Conteúdo */}
                            <p className="text-[12px] leading-relaxed text-on-surface-variant/80">{c.conteudo}</p>

                            {/* Meta */}
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-on-surface-variant/50">
                              {c.publicadoEm && (
                                <span>Publicado {new Date(c.publicadoEm).toLocaleDateString('pt-BR')}</span>
                              )}
                              {c.expiradoEm && (
                                <span>Expira {new Date(c.expiradoEm).toLocaleDateString('pt-BR')}</span>
                              )}
                              {alcance > 0 && (
                                <span className="flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                                    mail
                                  </span>
                                  {alcance} {alcance === 1 ? 'email disparado' : 'emails disparados'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Paginação */}
          <ComunicadosPaginacao
            pagina={pagina}
            totalPaginas={totalPaginas}
            total={total}
            porPagina={POR_PAGINA}
          />
        </div>
      )}
    </div>
  )
}
