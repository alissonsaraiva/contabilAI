import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

/**
 * Entidades suportadas e seus campos de agrupamento válidos.
 * Toda query é pré-definida — sem SQL livre.
 */
type Entidade = 'clientes' | 'leads' | 'tarefas' | 'interacoes'
type Agrupar  = 'plano' | 'status' | 'mes' | 'responsavel' | 'canal'

const consultarDadosTool: Tool = {
  definition: {
    name: 'consultarDados',
    description:
      'Consulta dados estruturados do CRM com filtros opcionais e agrupamento. Use para gerar relatórios, análises e resumos. ' +
      'Entidades: "clientes" (base de clientes), "leads" (prospects no funil), "tarefas" (tarefas do escritório), "interacoes" (histórico de eventos). ' +
      'Exemplos de uso: "quantos clientes temos por plano", "leads criados este mês", "tarefas pendentes por responsável", "clientes inadimplentes".',
    inputSchema: {
      type: 'object',
      properties: {
        entidade: {
          type: 'string',
          enum: ['clientes', 'leads', 'tarefas', 'interacoes'],
          description: 'Qual tabela consultar.',
        },
        filtros: {
          type: 'object',
          description: 'Filtros opcionais para restringir a consulta.',
          properties: {
            status: {
              type: 'string',
              description:
                'Clientes: ativo|inadimplente|suspenso|cancelado|encerrado. ' +
                'Leads: iniciado|simulador|plano_escolhido|dados_preenchidos|revisao|contrato_gerado|aguardando_assinatura|assinado|expirado. ' +
                'Tarefas: pendente|em_andamento|aguardando_cliente|concluida|cancelada.',
            },
            plano: {
              type: 'string',
              enum: ['essencial', 'profissional', 'empresarial', 'startup'],
              description: 'Filtra por plano (clientes e leads).',
            },
            canal: {
              type: 'string',
              enum: ['site', 'whatsapp', 'indicacao', 'instagram', 'google', 'outro'],
              description: 'Canal de origem (leads).',
            },
            periodoInicio: {
              type: 'string',
              description: 'Data de início no formato ISO 8601 (ex: "2025-01-01"). Filtra pelo campo criadoEm.',
            },
            periodoFim: {
              type: 'string',
              description: 'Data de fim no formato ISO 8601 (ex: "2025-12-31"). Filtra pelo campo criadoEm.',
            },
            responsavelId: {
              type: 'string',
              description: 'ID do responsável para filtrar tarefas ou clientes/leads atribuídos a um operador específico.',
            },
          },
          required: [],
        },
        agrupar: {
          type: 'string',
          enum: ['plano', 'status', 'mes', 'responsavel', 'canal'],
          description:
            'Agrupa os resultados por um campo e retorna contagens. ' +
            '"plano" → por tipo de plano; "status" → por status; "mes" → por mês de criação; ' +
            '"responsavel" → por nome do responsável; "canal" → por canal de entrada (leads).',
        },
        limite: {
          type: 'number',
          description: 'Número máximo de registros a retornar quando não há agrupamento. Default: 20, máximo: 100.',
        },
      },
      required: ['entidade'],
    },
  },

  meta: {
    label: 'Consultar dados',
    descricao: 'Consulta dados do CRM com filtros e agrupamento para gerar relatórios e análises.',
    categoria: 'Consulta',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const entidade = input.entidade as Entidade
    const filtros  = (input.filtros  as Record<string, string> | undefined) ?? {}
    const agrupar  = input.agrupar  as Agrupar | undefined
    const limite   = Math.min(Number(input.limite ?? 20), 100)

    // ── Constrói o where base ───────────────────────────────────────────────

    const periodoInicio = filtros.periodoInicio ? new Date(filtros.periodoInicio) : undefined
    const periodoFim    = filtros.periodoFim    ? new Date(filtros.periodoFim)    : undefined

    const criadoEmFiltro = (periodoInicio || periodoFim)
      ? { ...(periodoInicio && { gte: periodoInicio }), ...(periodoFim && { lte: periodoFim }) }
      : undefined

    // ── Clientes ────────────────────────────────────────────────────────────

    if (entidade === 'clientes') {
      const where: Record<string, unknown> = {}
      if (filtros.status)        where.status   = filtros.status
      if (filtros.plano)         where.planoTipo = filtros.plano
      if (filtros.responsavelId) where.responsavelId = filtros.responsavelId
      if (criadoEmFiltro)        where.criadoEm = criadoEmFiltro

      if (agrupar === 'plano') {
        return agruparPor(
          await prisma.cliente.groupBy({ by: ['planoTipo'], where, _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
          r => ({ chave: r.planoTipo, total: r._count.id }),
          'plano',
        )
      }
      if (agrupar === 'status') {
        return agruparPor(
          await prisma.cliente.groupBy({ by: ['status'], where, _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
          r => ({ chave: r.status, total: r._count.id }),
          'status',
        )
      }
      if (agrupar === 'responsavel') {
        const rows = await prisma.cliente.findMany({
          where,
          select: { responsavel: { select: { nome: true } } },
        })
        return agruparNome(rows.map(r => r.responsavel?.nome ?? 'Sem responsável'), 'responsável')
      }
      if (agrupar === 'mes') {
        return await agruparPorMes('cliente', where)
      }

      const rows = await prisma.cliente.findMany({
        where,
        take: limite,
        orderBy: { criadoEm: 'desc' },
        select: {
          id: true, nome: true, email: true, planoTipo: true,
          status: true, valorMensal: true, criadoEm: true,
          responsavel: { select: { nome: true } },
        },
      })
      const total = await prisma.cliente.count({ where })
      const linhas = rows.map(r =>
        `• ${r.nome} | ${r.planoTipo} | ${r.status} | R$ ${Number(r.valorMensal).toFixed(2)} | resp: ${r.responsavel?.nome ?? '-'} | ${fmtData(r.criadoEm)}`
      )
      return {
        sucesso: true,
        dados:   rows,
        resumo:  [`${total} cliente(s) encontrado(s) (mostrando ${rows.length}):`, ...linhas].join('\n'),
      }
    }

    // ── Leads ───────────────────────────────────────────────────────────────

    if (entidade === 'leads') {
      const where: Record<string, unknown> = {}
      if (filtros.status)        where.status       = filtros.status
      if (filtros.plano)         where.planoTipo    = filtros.plano
      if (filtros.canal)         where.canal        = filtros.canal
      if (filtros.responsavelId) where.responsavelId = filtros.responsavelId
      if (criadoEmFiltro)        where.criadoEm     = criadoEmFiltro

      if (agrupar === 'status') {
        return agruparPor(
          await prisma.lead.groupBy({ by: ['status'], where, _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
          r => ({ chave: r.status, total: r._count.id }),
          'status',
        )
      }
      if (agrupar === 'plano') {
        return agruparPor(
          await prisma.lead.groupBy({ by: ['planoTipo'], where: { ...where, planoTipo: { not: null } }, _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
          r => ({ chave: r.planoTipo ?? 'não definido', total: r._count.id }),
          'plano',
        )
      }
      if (agrupar === 'canal') {
        return agruparPor(
          await prisma.lead.groupBy({ by: ['canal'], where, _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
          r => ({ chave: r.canal, total: r._count.id }),
          'canal',
        )
      }
      if (agrupar === 'mes') {
        return await agruparPorMes('lead', where)
      }

      const rows = await prisma.lead.findMany({
        where,
        take: limite,
        orderBy: { criadoEm: 'desc' },
        select: {
          id: true, contatoEntrada: true, canal: true,
          funil: true, status: true, planoTipo: true, criadoEm: true,
          responsavel: { select: { nome: true } },
        },
      })
      const total = await prisma.lead.count({ where })
      const linhas = rows.map(r =>
        `• ${r.contatoEntrada} | ${r.canal} | ${r.status} | plano: ${r.planoTipo ?? '-'} | resp: ${r.responsavel?.nome ?? '-'} | ${fmtData(r.criadoEm)}`
      )
      return {
        sucesso: true,
        dados:   rows,
        resumo:  [`${total} lead(s) encontrado(s) (mostrando ${rows.length}):`, ...linhas].join('\n'),
      }
    }

    // ── Tarefas ─────────────────────────────────────────────────────────────

    if (entidade === 'tarefas') {
      const where: Record<string, unknown> = {}
      if (filtros.status)        where.status       = filtros.status
      if (filtros.responsavelId) where.responsavelId = filtros.responsavelId
      if (criadoEmFiltro)        where.criadoEm     = criadoEmFiltro

      if (agrupar === 'status') {
        return agruparPor(
          await prisma.tarefa.groupBy({ by: ['status'], where, _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
          r => ({ chave: r.status, total: r._count.id }),
          'status',
        )
      }
      if (agrupar === 'responsavel') {
        const rows = await prisma.tarefa.findMany({
          where,
          select: { responsavel: { select: { nome: true } } },
        })
        return agruparNome(rows.map(r => r.responsavel?.nome ?? 'Sem responsável'), 'responsável')
      }
      if (agrupar === 'mes') {
        return await agruparPorMes('tarefa', where)
      }

      const rows = await prisma.tarefa.findMany({
        where,
        take: limite,
        orderBy: { criadoEm: 'desc' },
        select: {
          id: true, titulo: true, status: true, prioridade: true,
          prazo: true, criadoEm: true,
          cliente:    { select: { nome: true } },
          responsavel: { select: { nome: true } },
        },
      })
      const total = await prisma.tarefa.count({ where })
      const linhas = rows.map(r =>
        `• ${r.titulo} | ${r.status} | prioridade: ${r.prioridade} | cliente: ${r.cliente?.nome ?? '-'} | resp: ${r.responsavel?.nome ?? '-'} | prazo: ${r.prazo ? fmtData(r.prazo) : 'sem prazo'}`
      )
      return {
        sucesso: true,
        dados:   rows,
        resumo:  [`${total} tarefa(s) encontrada(s) (mostrando ${rows.length}):`, ...linhas].join('\n'),
      }
    }

    // ── Interações ──────────────────────────────────────────────────────────

    if (entidade === 'interacoes') {
      const where: Record<string, unknown> = {}
      if (filtros.responsavelId) where.usuarioId = filtros.responsavelId
      if (criadoEmFiltro)        where.criadoEm  = criadoEmFiltro

      if (agrupar === 'mes') {
        return await agruparPorMes('interacao', where)
      }
      if (agrupar === 'responsavel') {
        const rows = await prisma.interacao.findMany({
          where,
          select: { usuario: { select: { nome: true } } },
        })
        return agruparNome(rows.map(r => r.usuario?.nome ?? 'Sistema'), 'responsável')
      }

      const rows = await prisma.interacao.findMany({
        where,
        take: limite,
        orderBy: { criadoEm: 'desc' },
        select: {
          id: true, tipo: true, titulo: true, origem: true, criadoEm: true,
          cliente: { select: { nome: true } },
          lead:    { select: { contatoEntrada: true } },
          usuario: { select: { nome: true } },
        },
      })
      const total = await prisma.interacao.count({ where })
      const linhas = rows.map(r => {
        const quem = r.cliente?.nome ?? r.lead?.contatoEntrada ?? '-'
        return `• ${r.tipo}${r.titulo ? ': ' + r.titulo : ''} | ${quem} | por: ${r.usuario?.nome ?? r.origem} | ${fmtData(r.criadoEm)}`
      })
      return {
        sucesso: true,
        dados:   rows,
        resumo:  [`${total} interação(ões) encontrada(s) (mostrando ${rows.length}):`, ...linhas].join('\n'),
      }
    }

    return {
      sucesso: false,
      erro:   `Entidade desconhecida: ${entidade}`,
      resumo: 'Entidade inválida. Use: clientes, leads, tarefas ou interacoes.',
    }
  },
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtData(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

function agruparPor<T>(
  rows: T[],
  mapper: (r: T) => { chave: string | null; total: number },
  campo: string,
): ToolExecuteResult {
  const dados = rows.map(mapper)
  const total = dados.reduce((s, r) => s + r.total, 0)
  const linhas = dados.map(r => `• ${r.chave ?? 'não definido'}: ${r.total}`)
  return {
    sucesso: true,
    dados,
    resumo:  [`Total: ${total} — agrupado por ${campo}:`, ...linhas].join('\n'),
  }
}

function agruparNome(nomes: string[], campo: string): ToolExecuteResult {
  const contagem: Record<string, number> = {}
  for (const n of nomes) contagem[n] = (contagem[n] ?? 0) + 1
  const dados   = Object.entries(contagem).sort((a, b) => b[1] - a[1]).map(([chave, total]) => ({ chave, total }))
  const linhas  = dados.map(r => `• ${r.chave}: ${r.total}`)
  const total   = nomes.length
  return {
    sucesso: true,
    dados,
    resumo:  [`Total: ${total} — agrupado por ${campo}:`, ...linhas].join('\n'),
  }
}

// Agrupa por mês usando rawQuery pois Prisma não suporta DATE_TRUNC direto em groupBy
async function agruparPorMes(
  tabela: 'cliente' | 'lead' | 'tarefa' | 'interacao',
  where: Record<string, unknown>,
): Promise<ToolExecuteResult> {
  // Usa Prisma typed query com groupBy por ano/mês (workaround: buscar tudo e agrupar em JS)
  let rows: { criadoEm: Date }[] = []

  if (tabela === 'cliente')   rows = await prisma.cliente.findMany({ where: where as never, select: { criadoEm: true } })
  if (tabela === 'lead')      rows = await prisma.lead.findMany({ where: where as never, select: { criadoEm: true } })
  if (tabela === 'tarefa')    rows = await prisma.tarefa.findMany({ where: where as never, select: { criadoEm: true } })
  if (tabela === 'interacao') rows = await prisma.interacao.findMany({ where: where as never, select: { criadoEm: true } })

  const contagem: Record<string, number> = {}
  for (const r of rows) {
    const key = r.criadoEm.toLocaleDateString('pt-BR', { year: 'numeric', month: '2-digit', timeZone: 'America/Sao_Paulo' })
    contagem[key] = (contagem[key] ?? 0) + 1
  }

  const dados  = Object.entries(contagem).sort(([a], [b]) => a.localeCompare(b)).map(([mes, total]) => ({ mes, total }))
  const linhas = dados.map(r => `• ${r.mes}: ${r.total}`)
  return {
    sucesso: true,
    dados,
    resumo:  [`${rows.length} registro(s) — agrupado por mês:`, ...linhas].join('\n'),
  }
}

registrarTool(consultarDadosTool)
