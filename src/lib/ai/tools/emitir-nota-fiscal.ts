import { z } from 'zod'
import { registrarTool } from './registry'
import { emitirNotaFiscal } from '@/lib/services/notas-fiscais'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const emitirNotaFiscalTool: Tool = {
  definition: {
    name: 'emitirNotaFiscal',
    description:
      'Emite uma Nota Fiscal de Serviço (NFS-e) em nome do cliente. ' +
      'QUANDO USAR: quando o cliente ou operador solicitar emissão de nota fiscal, faturamento de serviço, "emitir NF", "lançar nota", ou similares. Inclui pedidos via texto, áudio transcrito ou baseados em imagem analisada. ' +
      'ANTES DE CHAMAR: 1) Chame verificarConfiguracaoNfse para confirmar que o cliente está habilitado. ' +
      '2) Colete todos os dados obrigatórios. 3) Se faltar qualquer dado, pergunte antes — NUNCA invente valores. ' +
      '4) Confirme os dados com o solicitante antes de emitir. ' +
      'LEITURA DE IMAGEM: se o solicitante enviou imagem (proposta, contrato), extraia os dados visíveis. Se campo crítico ilegível, pergunte. ' +
      'LEITURA DE ÁUDIO: o áudio já chegou transcrito — trate como texto normalmente. ' +
      'SE RETORNAR ERRO: chame imediatamente criarOrdemServico com tipo emissao_documento, incluindo todos os dados coletados, o motivo do erro e a mensagem original.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente. Use ctx.clienteId se disponível.',
        },
        ordemServicoId: {
          type: 'string',
          description: 'ID da OS que originou a emissão (opcional).',
        },
        descricao: {
          type: 'string',
          description: 'Descrição do serviço prestado. Seja específico — mínimo 20 caracteres. Ex: "Consultoria contábil mensal — março/2026".',
        },
        valor: {
          type: 'number',
          description: 'Valor total em reais. Ex: 3000.00. NUNCA arredonde ou estime.',
        },
        tomadorNome: {
          type: 'string',
          description: 'Nome da empresa ou pessoa que vai RECEBER a nota fiscal.',
        },
        tomadorCpfCnpj: {
          type: 'string',
          description: 'CPF (11 dígitos) ou CNPJ (14 dígitos) do tomador — somente números, sem máscara.',
        },
        tomadorEmail: {
          type: 'string',
          description: 'Email do tomador para envio automático (opcional).',
        },
        tomadorMunicipio: {
          type: 'string',
          description: 'Município do tomador (opcional, ex: "São Paulo").',
        },
        tomadorEstado: {
          type: 'string',
          description: 'UF do tomador (opcional, ex: "SP").',
        },
        issAliquota: {
          type: 'number',
          description: 'Alíquota ISS em decimal (opcional). Ex: 0.05 para 5%. Usa default do cliente/escritório se omitido.',
        },
        issRetido: {
          type: 'boolean',
          description: 'Se o tomador retém o ISS na fonte (opcional). Usa default se omitido.',
        },
        federalServiceCode: {
          type: 'string',
          description: 'Código LC 116/03 do serviço (opcional). Ex: "1.07". Usa default se omitido.',
        },
        cityServiceCode: {
          type: 'string',
          description: 'Código municipal do serviço (opcional). Usa default se omitido.',
        },
      },
      required: ['clienteId', 'descricao', 'valor', 'tomadorNome', 'tomadorCpfCnpj'],
    },
  },

  meta: {
    label: 'Emitir nota fiscal (NFS-e)',
    descricao: 'Emite uma Nota Fiscal de Serviço em nome do cliente via Spedy.',
    categoria: 'Nota Fiscal',
    canais: ['crm', 'whatsapp', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const parsed = z.object({
      clienteId:          z.string().min(1).optional(),
      ordemServicoId:     z.string().min(1).optional(),
      descricao:          z.string().min(10).max(2000),
      valor:              z.number().positive(),
      tomadorNome:        z.string().min(2).max(500),
      tomadorCpfCnpj:     z.string().min(11).max(14).regex(/^\d+$/, 'Somente números'),
      tomadorEmail:       z.string().email().optional(),
      tomadorMunicipio:   z.string().optional(),
      tomadorEstado:      z.string().length(2).optional(),
      issAliquota:        z.number().min(0).max(1).optional(),
      issRetido:          z.boolean().optional(),
      federalServiceCode: z.string().optional(),
      cityServiceCode:    z.string().optional(),
      taxationType:       z.string().optional(),
    }).safeParse(input)

    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return {
        sucesso: false,
        erro:    `Parâmetro inválido: ${issue.path.join('.')} — ${issue.message}`,
        resumo:  `Dados inválidos para emissão de nota: ${issue.message}`,
      }
    }

    const clienteId = parsed.data.clienteId ?? ctx.clienteId
    if (!clienteId) {
      return { sucesso: false, erro: 'clienteId obrigatório', resumo: 'Cliente não identificado.' }
    }

    try {
      const resultado = await emitirNotaFiscal({
        clienteId,
        ordemServicoId:    parsed.data.ordemServicoId,
        descricao:         parsed.data.descricao,
        valor:             parsed.data.valor,
        tomadorNome:       parsed.data.tomadorNome,
        tomadorCpfCnpj:    parsed.data.tomadorCpfCnpj,
        tomadorEmail:      parsed.data.tomadorEmail,
        tomadorMunicipio:  parsed.data.tomadorMunicipio,
        tomadorEstado:     parsed.data.tomadorEstado,
        issAliquota:       parsed.data.issAliquota,
        issRetido:         parsed.data.issRetido,
        federalServiceCode: parsed.data.federalServiceCode,
        cityServiceCode:   parsed.data.cityServiceCode,
        taxationType:      parsed.data.taxationType,
        emitidaPorId:      ctx.usuarioId ?? undefined,
      })

      if (!resultado.sucesso) {
        return {
          sucesso: false,
          dados:   resultado,
          erro:    resultado.detalhe,
          resumo:  `Emissão bloqueada (${resultado.motivo}): ${resultado.detalhe}. Abra um chamado com tipo emissao_documento incluindo todos os dados coletados.`,
        }
      }

      return {
        sucesso: true,
        dados:   resultado,
        resumo:  `NFS-e enviada para processamento. ${resultado.mensagem} ID interno: ${resultado.notaFiscalId}. Status: ${resultado.status}. Aguardando autorização da prefeitura — informarei quando autorizada.`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro interno'
      return {
        sucesso: false,
        erro:    msg,
        resumo:  `Erro ao emitir nota fiscal: ${msg}. Abra um chamado tipo emissao_documento com os dados coletados.`,
      }
    }
  },
}

registrarTool(emitirNotaFiscalTool)
