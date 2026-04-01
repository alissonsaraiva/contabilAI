import { z } from 'zod'
import { registrarTool } from './registry'
import { reemitirNotaFiscal } from '@/lib/services/notas-fiscais'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const reemitirNotaFiscalTool: Tool = {
  definition: {
    name: 'reemitirNotaFiscal',
    description:
      'Reemite uma NFS-e rejeitada ou com erro interno. ' +
      'QUANDO USAR: quando o cliente ou operador pedir para reemitir, corrigir ou tentar novamente uma nota que foi rejeitada pela prefeitura. ' +
      'ANTES DE CHAMAR: 1) Consulte a nota com consultarNotasFiscais para confirmar o status e mostrar o motivo da rejeição. ' +
      '2) Informe o motivo da rejeição ao solicitante. ' +
      '3) Se o motivo exigir correção de dados (ex: CPF/CNPJ errado, descrição inválida), colete os dados corrigidos antes de reemitir. ' +
      '4) Confirme com o solicitante antes de executar. ' +
      'SE RETORNAR ERRO: chame criarOrdemServico com tipo emissao_documento incluindo o ID da nota, o erro e os dados disponíveis.',
    inputSchema: {
      type: 'object',
      properties: {
        notaFiscalId: {
          type: 'string',
          description: 'ID interno da nota fiscal a reemitir (campo id retornado por consultarNotasFiscais).',
        },
        descricao: {
          type: 'string',
          description: 'Nova descrição do serviço (opcional — use apenas se houve erro na descrição original).',
        },
        valor: {
          type: 'number',
          description: 'Novo valor em reais (opcional — use apenas se houve erro no valor original).',
        },
        tomadorNome: {
          type: 'string',
          description: 'Nome corrigido do tomador (opcional).',
        },
        tomadorCpfCnpj: {
          type: 'string',
          description: 'CPF ou CNPJ corrigido do tomador — somente números (opcional).',
        },
        tomadorEmail: {
          type: 'string',
          description: 'Email corrigido do tomador (opcional).',
        },
        tomadorMunicipio: {
          type: 'string',
          description: 'Município corrigido do tomador (opcional).',
        },
        tomadorEstado: {
          type: 'string',
          description: 'UF corrigida do tomador (opcional).',
        },
      },
      required: ['notaFiscalId'],
    },
  },

  meta: {
    label: 'Reemitir nota fiscal rejeitada',
    descricao: 'Reemite uma NFS-e rejeitada ou com erro, com possibilidade de corrigir dados.',
    categoria: 'Nota Fiscal',
    canais: ['crm', 'whatsapp', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const parsed = z.object({
      notaFiscalId:     z.string().min(1),
      descricao:        z.string().min(10).max(2000).optional(),
      valor:            z.number().positive().optional(),
      tomadorNome:      z.string().min(2).max(500).optional(),
      tomadorCpfCnpj:   z.string().min(11).max(14).regex(/^\d+$/, 'Somente números').optional(),
      tomadorEmail:     z.string().email().optional(),
      tomadorMunicipio: z.string().optional(),
      tomadorEstado:    z.string().length(2).optional(),
    }).safeParse(input)

    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return {
        sucesso: false,
        erro:    `Parâmetro inválido: ${issue.path.join('.')} — ${issue.message}`,
        resumo:  `Dados inválidos para reemissão: ${issue.message}`,
      }
    }

    try {
      const { notaFiscalId, ...overrides } = parsed.data

      const resultado = await reemitirNotaFiscal(
        notaFiscalId,
        Object.keys(overrides).length > 0
          ? { ...overrides, emitidaPorId: ctx.usuarioId ?? undefined }
          : { emitidaPorId: ctx.usuarioId ?? undefined },
      )

      if (!resultado.sucesso) {
        return {
          sucesso: false,
          dados:   resultado,
          erro:    resultado.detalhe,
          resumo:  `Reemissão bloqueada (${resultado.motivo}): ${resultado.detalhe}. Abra um chamado com tipo emissao_documento.`,
        }
      }

      return {
        sucesso: true,
        dados:   resultado,
        resumo:  `NFS-e reenviada para processamento. ${resultado.mensagem} Aguardando nova resposta da prefeitura — informarei quando autorizada.`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro interno'
      return {
        sucesso: false,
        erro:    msg,
        resumo:  `Erro ao reemitir nota: ${msg}. Abra um chamado tipo emissao_documento com o ID da nota.`,
      }
    }
  },
}

registrarTool(reemitirNotaFiscalTool)
