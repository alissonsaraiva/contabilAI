import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const criarOrdemServicoTool: Tool = {
  definition: {
    name: 'criarOrdemServico',
    description:
      'Cria um chamado (ordem de serviço) no sistema. Use quando: cliente solicitar algo no WhatsApp, IA precisar delegar uma tarefa a um humano, operador criar uma tarefa interna. Substitui criarTarefa.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string', description: 'ID do cliente vinculado.' },
        tipo: {
          type: 'string',
          enum: ['duvida', 'solicitacao', 'reclamacao', 'documento', 'emissao_documento', 'correcao_documento', 'solicitacao_documento', 'tarefa_interna', 'outros'],
          description: 'Tipo do chamado.',
        },
        titulo: { type: 'string', description: 'Título resumido do chamado.' },
        descricao: { type: 'string', description: 'Descrição completa — inclua todo o contexto disponível.' },
        prioridade: {
          type: 'string',
          enum: ['baixa', 'media', 'alta', 'urgente'],
          description: 'Prioridade. Default: media.',
        },
        origem: {
          type: 'string',
          enum: ['cliente', 'ia', 'operador'],
          description: 'Quem originou: cliente (portal), ia (IA em nome do cliente), operador (interno). Default: ia quando chamado pela IA.',
        },
        visivelPortal: {
          type: 'boolean',
          description: 'Se o cliente pode ver no portal. Default: true para cliente/ia, false para tarefa_interna.',
        },
      },
      required: ['clienteId', 'tipo', 'titulo', 'descricao'],
    },
  },

  meta: {
    label: 'Criar chamado',
    descricao: 'Cria um chamado (OS) vinculado ao cliente — substitui criarTarefa. Aceita origem cliente, IA ou operador.',
    categoria: 'Chamados',
    canais: ['crm', 'whatsapp', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId    = (input.clienteId as string | undefined) ?? ctx.clienteId
    const tipo         = (input.tipo      as string) ?? 'outros'
    const titulo       = input.titulo     as string
    const descricao    = input.descricao  as string
    const prioridade   = (input.prioridade as string | undefined) ?? 'media'
    const origemInput  = (input.origem    as string | undefined)
    const origem       = origemInput ?? (ctx.solicitanteAI === 'crm' ? 'operador' : 'ia')
    const tarRefInterna = tipo === 'tarefa_interna'
    const visivelPortal = input.visivelPortal !== undefined
      ? (input.visivelPortal as boolean)
      : !tarRefInterna

    if (!clienteId) {
      return { sucesso: false, erro: 'clienteId obrigatório.', resumo: 'Não foi possível criar o chamado: cliente não identificado.' }
    }

    // Busca empresa vinculada ao cliente
    const cliente = await prisma.cliente.findUnique({
      where:  { id: clienteId },
      select: { empresaId: true, nome: true },
    })

    const os = await prisma.ordemServico.create({
      data: {
        clienteId,
        empresaId:    cliente?.empresaId ?? undefined,
        tipo:         tipo        as never,
        origem:       origem      as never,
        visivelPortal,
        titulo,
        descricao,
        prioridade:   prioridade  as never,
        status:       'aberta',
      },
    })

    return {
      sucesso: true,
      dados:   { osId: os.id, clienteNome: cliente?.nome },
      resumo:  `Chamado criado: "${titulo}" (${tipo}) para ${cliente?.nome ?? clienteId}. ID: ${os.id}. Visível no portal: ${visivelPortal}.`,
    }
  },
}

registrarTool(criarOrdemServicoTool)
