import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const gerarRelatorioInadimplenciaTool: Tool = {
  definition: {
    name: 'gerarRelatorioInadimplencia',
    description: 'Gera relatório de inadimplência com aging (30/60/90+ dias) dos clientes. Usa a data de vencimento de cada cliente para calcular quantos dias estão em atraso. Ideal para reuniões de cobrança, análise de fluxo de caixa e priorização de contato. Use publicarRelatorio após obter os dados para salvar no painel.',
    inputSchema: {
      type: 'object',
      properties: {
        incluirSuspensos: {
          type: 'boolean',
          description: 'Incluir clientes com status "suspenso" além dos "inadimplentes" (padrão: true).',
        },
        planoTipo: {
          type: 'string',
          enum: ['essencial', 'profissional', 'empresarial', 'startup'],
          description: 'Filtrar por tipo de plano (opcional).',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Relatório de inadimplência',
    descricao: 'Gera relatório de inadimplência com aging (30/60/90+ dias) por cliente.',
    categoria: 'Relatórios',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const incluirSuspensos = input.incluirSuspensos !== false
    const planoTipo        = input.planoTipo as string | undefined

    const statusBusca = incluirSuspensos
      ? ['inadimplente', 'suspenso']
      : ['inadimplente']

    const clientes = await prisma.cliente.findMany({
      where: {
        status:    { in: statusBusca as any[] },
        ...(planoTipo ? { planoTipo: planoTipo as any } : {}),
      },
      select: {
        id:            true,
        nome:          true,
        email:         true,
        telefone:      true,
        whatsapp:      true,
        planoTipo:     true,
        valorMensal:   true,
        vencimentoDia: true,
        status:        true,
        empresa:       { select: { razaoSocial: true } },
        responsavel:   { select: { nome: true } },
        // Cobranças reais para calcular aging preciso
        cobrancasAsaas: {
          where:   { status: { in: ['PENDING', 'OVERDUE'] } },
          orderBy: { vencimento: 'asc' },
          take:    1,
          select:  { vencimento: true, valor: true },
        },
      },
      orderBy: { vencimentoDia: 'asc' },
    }).catch(err => { console.error('[tool/gerar-relatorio-inadimplencia] falha:', err); return [] as any[] })

    if (clientes.length === 0) {
      return {
        sucesso: true,
        dados:   { total: 0, aging: {} },
        resumo:  'Nenhum cliente inadimplente ou suspenso encontrado.',
      }
    }

    // Calcula aging: dias desde o vencimento do mês corrente
    const hoje      = new Date()
    const mesAtual  = hoje.getMonth()
    const anoAtual  = hoje.getFullYear()

    type ClienteAging = {
      nome: string
      plano: string
      valor: string
      status: string
      diasAtraso: number
      responsavel: string
      contato: string
    }

    const aging: { ate30: ClienteAging[]; de31a60: ClienteAging[]; de61a90: ClienteAging[]; acima90: ClienteAging[] } = {
      ate30: [], de31a60: [], de61a90: [], acima90: [],
    }

    let totalEmAberto = 0

    for (const c of clientes) {
      // Usa a data real da cobrança Asaas quando disponível (aging preciso)
      // Fallback: calcula estimativa com vencimentoDia quando não há cobrança registrada
      const cobrancaAberta = (c as any).cobrancasAsaas?.[0]
      let diasAtraso: number
      if (cobrancaAberta?.vencimento) {
        const venc = new Date(cobrancaAberta.vencimento)
        diasAtraso = Math.max(0, Math.floor((hoje.getTime() - venc.getTime()) / 86400000))
      } else {
        const diaVenc  = c.vencimentoDia ?? 10
        const lastDay  = new Date(anoAtual, mesAtual + 1, 0).getDate()
        const dataVenc = new Date(anoAtual, mesAtual, Math.min(diaVenc, lastDay))
        if (dataVenc > hoje) dataVenc.setMonth(dataVenc.getMonth() - 1)
        diasAtraso = Math.max(0, Math.floor((hoje.getTime() - dataVenc.getTime()) / 86400000))
      }
      // Usa o valor real da cobrança se disponível, senão o valorMensal cadastrado
      const valorNum = cobrancaAberta?.valor
        ? Number(cobrancaAberta.valor)
        : (c.valorMensal ? Number(c.valorMensal) : 0)
      const valor = valorNum ? `R$ ${valorNum.toFixed(2)}` : 'N/D'
      const entry: ClienteAging = {
        nome:        c.empresa?.razaoSocial ?? c.nome,
        plano:       c.planoTipo,
        valor,
        status:      c.status,
        diasAtraso,
        responsavel: c.responsavel?.nome ?? 'sem responsável',
        contato:     c.whatsapp ?? c.telefone ?? c.email,
      }

      if (diasAtraso <= 30)       aging.ate30.push(entry)
      else if (diasAtraso <= 60)  aging.de31a60.push(entry)
      else if (diasAtraso <= 90)  aging.de61a90.push(entry)
      else                        aging.acima90.push(entry)

      totalEmAberto += valorNum
    }

    const formatarLista = (lista: ClienteAging[]) =>
      lista.map(c => `  ${c.nome} | ${c.plano} | ${c.valor} | ${c.diasAtraso}d | ${c.responsavel} | ${c.contato}`).join('\n')

    const linhas = [
      `RELATÓRIO DE INADIMPLÊNCIA — ${hoje.toLocaleDateString('pt-BR')}`,
      `Total em aberto estimado: R$ ${totalEmAberto.toFixed(2)}`,
      `Total de clientes: ${clientes.length}`,
      '',
      `Até 30 dias (${aging.ate30.length}):`,
      aging.ate30.length ? formatarLista(aging.ate30) : '  Nenhum',
      '',
      `31 a 60 dias (${aging.de31a60.length}):`,
      aging.de31a60.length ? formatarLista(aging.de31a60) : '  Nenhum',
      '',
      `61 a 90 dias (${aging.de61a90.length}):`,
      aging.de61a90.length ? formatarLista(aging.de61a90) : '  Nenhum',
      '',
      `Acima de 90 dias (${aging.acima90.length}):`,
      aging.acima90.length ? formatarLista(aging.acima90) : '  Nenhum',
    ].join('\n')

    return {
      sucesso: true,
      dados:   { total: clientes.length, totalEmAberto, aging },
      resumo:  linhas,
    }
  },
}

registrarTool(gerarRelatorioInadimplenciaTool)
