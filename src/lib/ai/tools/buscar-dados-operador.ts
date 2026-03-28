import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const buscarDadosOperadorTool: Tool = {
  definition: {
    name: 'buscarDadosOperador',
    description:
      'Busca os dados do operador (contador/admin/atendente) que está solicitando a ação — nome, e-mail e tipo. Use quando precisar enviar um relatório, e-mail ou WhatsApp para o próprio operador que fez a solicitação, ex: "me manda por email", "envia pra mim", "manda no meu zap".',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  meta: {
    label: 'Dados do operador',
    descricao: 'Retorna nome, e-mail e tipo do operador autenticado que acionou o agente — para enviar relatórios ou mensagens a ele.',
    categoria: 'Clientes',
    canais: ['crm'],
  },

  async execute(_input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    if (!ctx.usuarioId) {
      return {
        sucesso: false,
        erro:   'Contexto de usuário não disponível.',
        resumo: 'Não foi possível identificar o operador — esta ação só funciona no canal CRM.',
      }
    }

    const usuario = await prisma.usuario.findUnique({
      where:  { id: ctx.usuarioId },
      select: { id: true, nome: true, email: true, tipo: true, whatsapp: true },
    })

    if (!usuario) {
      return {
        sucesso: false,
        erro:   'Usuário não encontrado.',
        resumo: 'Operador não encontrado no banco de dados.',
      }
    }

    return {
      sucesso: true,
      dados:   { usuarioId: usuario.id, nome: usuario.nome, email: usuario.email, whatsapp: usuario.whatsapp ?? null, tipo: usuario.tipo },
      resumo:  `Operador: ${usuario.nome} | E-mail: ${usuario.email} | WhatsApp: ${usuario.whatsapp ?? 'não cadastrado'} | Tipo: ${usuario.tipo}. Use o e-mail ou WhatsApp para enviar relatórios diretamente a ele.`,
    }
  },
}

registrarTool(buscarDadosOperadorTool)
