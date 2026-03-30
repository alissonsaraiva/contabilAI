import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { FEATURE_LABELS } from '@/lib/ai/constants'
import '@/lib/ai/tools'
import { getCapacidades } from '@/lib/ai/tools/registry'

function buildDateFilter(periodo: string | null): Date | null {
  if (!periodo || periodo === 'all') return null
  const now = new Date()
  if (periodo === '1d')  { now.setDate(now.getDate() - 1);   return now }
  if (periodo === '7d')  { now.setDate(now.getDate() - 7);   return now }
  if (periodo === '30d') { now.setDate(now.getDate() - 30);  return now }
  return null
}

function escapeCSV(val: unknown): string {
  if (val === null || val === undefined) return ''
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const filterTool   = searchParams.get('tool')      || undefined
  const filterFeat   = searchParams.get('solicitante') || undefined
  const filterOk     = searchParams.get('sucesso')   || undefined
  const filterPeriod = searchParams.get('periodo')   || undefined
  const filterSearch = searchParams.get('search')    || undefined

  const desde = buildDateFilter(filterPeriod ?? null)

  const where = {
    ...(filterTool && { tool: filterTool }),
    ...(filterFeat && { solicitanteAI: filterFeat }),
    ...(filterOk !== undefined && filterOk !== '' && { sucesso: filterOk === 'true' }),
    ...(desde && { criadoEm: { gte: desde } }),
  }

  const acoes = await prisma.agenteAcao.findMany({
    where,
    orderBy: { criadoEm: 'desc' },
    take: 10_000,
    select: {
      id: true, tool: true, sucesso: true, duracaoMs: true,
      solicitanteAI: true, usuarioNome: true, usuarioTipo: true,
      clienteId: true, leadId: true, criadoEm: true, resultado: true, input: true,
    },
  })

  // Resolve nomes
  const clienteIds = [...new Set(acoes.map(a => a.clienteId).filter(Boolean))] as string[]
  const leadIds    = [...new Set(acoes.map(a => a.leadId).filter(Boolean))]    as string[]
  const [clientes, leads] = await Promise.all([
    clienteIds.length > 0
      ? prisma.cliente.findMany({ where: { id: { in: clienteIds } }, select: { id: true, nome: true, empresa: { select: { razaoSocial: true } } } })
      : [],
    leadIds.length > 0
      ? prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, contatoEntrada: true, dadosJson: true } })
      : [],
  ])
  const clienteMap = Object.fromEntries(clientes.map(c => [c.id, c.empresa?.razaoSocial ?? c.nome ?? '']))
  const leadMap    = Object.fromEntries(leads.map(l => {
    const d = (l.dadosJson ?? {}) as Record<string, string>
    return [l.id, d['Nome completo'] ?? d['Razão Social'] ?? l.contatoEntrada ?? '']
  }))

  const capacidades  = getCapacidades()
  const toolLabelMap = Object.fromEntries(capacidades.map(c => [c.tool, c.label]))

  // Filtro de busca por contexto
  const filtrados = filterSearch
    ? acoes.filter(a => {
        const ctx = a.clienteId ? clienteMap[a.clienteId] : a.leadId ? leadMap[a.leadId] : ''
        return ctx?.toLowerCase().includes(filterSearch.toLowerCase())
      })
    : acoes

  const header = ['ID', 'Tool', 'Origem', 'Sucesso', 'Duração (ms)', 'Operador', 'Tipo operador', 'Contexto', 'Input', 'Resultado resumo', 'Erro', 'Data']
  const rows = filtrados.map(a => {
    const res    = a.resultado as Record<string, unknown> | null
    const resumo = typeof res?.resumo === 'string' ? res.resumo : ''
    const erro   = typeof res?.erro   === 'string' ? res.erro   : ''
    const ctx    = a.clienteId ? clienteMap[a.clienteId] : a.leadId ? leadMap[a.leadId] : ''
    return [
      a.id,
      toolLabelMap[a.tool] ?? a.tool,
      FEATURE_LABELS[a.solicitanteAI] ?? a.solicitanteAI,
      a.sucesso ? 'sim' : 'não',
      a.duracaoMs,
      a.usuarioNome ?? 'automático',
      a.usuarioTipo ?? '',
      ctx,
      a.input ? JSON.stringify(a.input) : '',
      resumo,
      erro,
      a.criadoEm.toISOString(),
    ].map(escapeCSV).join(',')
  })

  const csv = [header.join(','), ...rows].join('\n')
  const filename = `logs-agente-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
