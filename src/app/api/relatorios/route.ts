import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const PER_PAGE = 20

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q              = searchParams.get('q')?.trim() ?? ''
  const tipo           = searchParams.get('tipo') ?? ''           // 'agendado' | 'manual' | ''
  const agendamentoId  = searchParams.get('agendamentoId') ?? ''
  const ano            = searchParams.get('ano') ? parseInt(searchParams.get('ano')!) : null
  const mes            = searchParams.get('mes') ? parseInt(searchParams.get('mes')!) : null
  const sucesso        = searchParams.get('sucesso')               // 'true' | 'false' | ''
  const page           = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const skip           = (page - 1) * PER_PAGE

  // Filtro de período
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
        { titulo:   { contains: q, mode: 'insensitive' } },
        { conteudo: { contains: q, mode: 'insensitive' } },
        { criadoPorNome: { contains: q, mode: 'insensitive' } },
      ]} : {},
      tipo           ? { tipo }                                 : {},
      agendamentoId  ? { agendamentoId }                        : {},
      sucesso === 'true'  ? { sucesso: true }                   : {},
      sucesso === 'false' ? { sucesso: false }                  : {},
      dateFrom ? { criadoEm: { gte: dateFrom } }               : {},
      dateTo   ? { criadoEm: { lt: dateTo } }                  : {},
    ],
  }

  const [relatorios, total] = await Promise.all([
    prisma.relatorioAgente.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip,
      take: PER_PAGE,
      select: {
        id: true, titulo: true, tipo: true, sucesso: true,
        agendamentoId: true, agendamentoDesc: true,
        criadoPorId: true, criadoPorNome: true,
        arquivoUrl: true, arquivoNome: true,
        criadoEm: true,
        // conteúdo omitido na listagem — só no detalhe
      },
    }),
    prisma.relatorioAgente.count({ where }),
  ])

  // Anos disponíveis para o seletor de período
  const anosRaw = await prisma.relatorioAgente.findMany({
    select: { criadoEm: true },
    orderBy: { criadoEm: 'asc' },
    distinct: [],
  })
  const anos = [...new Set(anosRaw.map(r => new Date(r.criadoEm).getFullYear()))].sort((a, b) => b - a)

  return NextResponse.json({ relatorios, total, page, perPage: PER_PAGE, anos })
}
