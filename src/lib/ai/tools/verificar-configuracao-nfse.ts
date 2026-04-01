import { z } from 'zod'
import { registrarTool } from './registry'
import { verificarConfiguracaoNfse } from '@/lib/services/notas-fiscais'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const verificarConfiguracaoNfseTool: Tool = {
  definition: {
    name: 'verificarConfiguracaoNfse',
    description:
      'Verifica se o cliente está habilitado para emitir NFS-e e se o município está integrado com a plataforma fiscal. ' +
      'USE SEMPRE ANTES de tentar emitir uma nota fiscal. ' +
      'Também use quando o cliente perguntar "vocês emitem nota pra mim?", "posso emitir nota aqui?", ou qualquer variação sobre disponibilidade do serviço. ' +
      'Retorna: status da configuração, se o município é suportado, e o que falta para habilitar.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente. Use ctx.clienteId se disponível.',
        },
      },
      required: ['clienteId'],
    },
  },

  meta: {
    label: 'Verificar configuração NFS-e',
    descricao: 'Verifica se o cliente está configurado para emissão de nota fiscal de serviço.',
    categoria: 'Nota Fiscal',
    canais: ['crm', 'whatsapp', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const parsed = z.object({
      clienteId: z.string().min(1),
    }).safeParse(input)

    if (!parsed.success) {
      return { sucesso: false, erro: 'clienteId obrigatório', resumo: 'Parâmetro inválido.' }
    }

    const clienteId = parsed.data.clienteId ?? ctx.clienteId
    if (!clienteId) {
      return { sucesso: false, erro: 'clienteId não encontrado', resumo: 'Cliente não identificado.' }
    }

    try {
      const resultado = await verificarConfiguracaoNfse(clienteId)

      if (resultado.configurado && resultado.municipioIntegrado !== false) {
        return {
          sucesso: true,
          dados:   resultado,
          resumo:  'Cliente configurado para emissão de NFS-e. Município integrado. Pode emitir.',
        }
      }

      const motivos = resultado.motivos.join('; ')
      return {
        sucesso: false,
        dados:   resultado,
        resumo:  `Não é possível emitir NFS-e automaticamente. Motivos: ${motivos}`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro interno'
      return { sucesso: false, erro: msg, resumo: `Erro ao verificar configuração: ${msg}` }
    }
  },
}

registrarTool(verificarConfiguracaoNfseTool)
