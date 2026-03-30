import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const listarComunicadosTool: Tool = {
  definition: {
    name: 'listarComunicados',
    description: 'Lista os comunicados publicados pelo escritório. Use quando o cliente perguntar se há avisos, comunicados ou informações enviadas pelo escritório. Retorna título, tipo, data de publicação e resumo do conteúdo.',
    inputSchema: {
      type: 'object',
      properties: {
        limite: {
          type: 'number',
          description: 'Quantidade de comunicados a retornar (padrão: 5, máximo: 10).',
        },
        tipo: {
          type: 'string',
          enum: ['informativo', 'urgente', 'regulatorio', 'lembrete'],
          description: 'Filtrar por tipo de comunicado (opcional).',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Listar comunicados',
    descricao: 'Lista os comunicados publicados pelo escritório para o portal do cliente.',
    categoria: 'Portal',
    canais: ['portal', 'crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const limite = Math.min(Number(input.limite ?? 5), 10)
    const tipo   = input.tipo as string | undefined

    const comunicados = await prisma.comunicado.findMany({
      where: {
        publicado: true,
        ...(tipo ? { tipo: tipo as any } : {}),
        OR: [
          { expiradoEm: null },
          { expiradoEm: { gt: new Date() } },
        ],
      },
      orderBy: { publicadoEm: 'desc' },
      take:    limite,
      select: {
        id:          true,
        titulo:      true,
        tipo:        true,
        conteudo:    true,
        publicadoEm: true,
        anexoNome:   true,
        expiradoEm:  true,
      },
    })

    if (comunicados.length === 0) {
      return {
        sucesso: true,
        dados:   [],
        resumo:  'Nenhum comunicado publicado encontrado.',
      }
    }

    const linhas = comunicados.map(c => {
      const data = c.publicadoEm?.toLocaleDateString('pt-BR') ?? 'data não informada'
      const resumo = c.conteudo.slice(0, 150).replace(/\n/g, ' ')
      const anexo = c.anexoNome ? ` [anexo: ${c.anexoNome}]` : ''
      const expira = c.expiradoEm ? ` (válido até ${c.expiradoEm.toLocaleDateString('pt-BR')})` : ''
      return `• [${c.tipo}] ${c.titulo} — ${data}${expira}${anexo}\n  ${resumo}...`
    })

    return {
      sucesso: true,
      dados:   comunicados,
      resumo:  `${comunicados.length} comunicado(s) encontrado(s):\n\n${linhas.join('\n\n')}`,
    }
  },
}

registrarTool(listarComunicadosTool)
