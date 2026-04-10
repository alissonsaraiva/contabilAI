import { prisma } from '@/lib/prisma'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { registrarInteracao } from '@/lib/services/interacoes'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const reativarClienteTool: Tool = {
  definition: {
    name: 'reativarCliente',
    description: 'Reativa um cliente inadimplente, suspenso ou cancelado voltando seu status para "ativo". Use quando o operador confirmar que o cliente regularizou a situação ou quando for necessário reativá-lo manualmente. Registra o motivo da reativação.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente a ser reativado.',
        },
        motivo: {
          type: 'string',
          description: 'Motivo da reativação (ex: "Pagamento regularizado", "Acordo firmado", "Retorno após cancelamento"). Será registrado no histórico.',
        },
      },
      required: ['clienteId'],
    },
  },

  meta: {
    label: 'Reativar cliente',
    descricao: 'Reativa cliente inadimplente, suspenso ou cancelado, restaurando status "ativo".',
    categoria: 'Clientes',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId = (input.clienteId as string | undefined) ?? ctx.clienteId
    const motivo    = (input.motivo as string | undefined) ?? 'Reativação manual pelo operador'

    if (!clienteId) {
      return {
        sucesso: false,
        erro: 'clienteId é obrigatório.',
        resumo: 'Não foi possível reativar: cliente não identificado.',
      }
    }

    const cliente = await prisma.cliente.findUnique({
      where:  { id: clienteId },
      select: { id: true, nome: true, status: true, empresa: { select: { razaoSocial: true } }, clienteEmpresas: { include: { empresa: { select: { razaoSocial: true } } }, orderBy: { principal: 'desc' }, take: 1 } },
    })

    if (!cliente) {
      return {
        sucesso: false,
        erro: `Cliente ${clienteId} não encontrado.`,
        resumo: 'Cliente não encontrado.',
      }
    }

    if (cliente.status === 'ativo') {
      return {
        sucesso: true,
        dados:   { id: clienteId, status: 'ativo' },
        resumo:  `${cliente.clienteEmpresas[0]?.empresa.razaoSocial ?? cliente.empresa?.razaoSocial ?? cliente.nome} já está com status "ativo". Nenhuma alteração necessária.`,
      }
    }

    const statusAnterior = cliente.status

    await prisma.cliente.update({
      where: { id: clienteId },
      data:  { status: 'ativo' },
    })

    // Registra no histórico como interação (service garante indexação RAG)
    registrarInteracao({
      clienteId,
      tipo:    'nota_interna',
      titulo:  `Cliente reativado (era: ${statusAnterior})`,
      conteudo: motivo,
      origem:  'ia',
      metadados: { solicitanteAI: ctx.solicitanteAI, statusAnterior },
    }).catch((err: unknown) =>
      console.error('[tool/reativar-cliente] erro ao registrar interação:', { clienteId, err }),
    )

    // Re-indexa cliente atualizado
    const clienteAtualizado = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        id: true, nome: true, email: true, cpf: true, telefone: true, whatsapp: true,
        planoTipo: true, valorMensal: true, vencimentoDia: true, formaPagamento: true,
        cidade: true, uf: true,
      },
    }).catch(() => null)
    if (clienteAtualizado) {
      indexarAsync('cliente', clienteAtualizado)
    }

    return {
      sucesso: true,
      dados:   { id: clienteId, statusAnterior, statusNovo: 'ativo' },
      resumo:  `${cliente.clienteEmpresas[0]?.empresa.razaoSocial ?? cliente.empresa?.razaoSocial ?? cliente.nome} reativado com sucesso. Status anterior: "${statusAnterior}". Motivo: ${motivo}.`,
    }
  },
}

registrarTool(reativarClienteTool)
