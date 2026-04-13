import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolverEmpresaIdDoCliente, resolverEmpresasDoCliente, formatarEmpresasParaTexto } from './resolver-empresa'
import { registrarTool } from './registry'
import { emitirNotaFiscal } from '@/lib/services/notas-fiscais'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

/** Abre chamado de escalonamento garantido — não depende da IA chamar criarChamado */
async function escalarParaHumano(
  clienteId: string,
  tituloChamado: string,
  descricaoChamado: string,
): Promise<void> {
  try {
    const empresaId = await resolverEmpresaIdDoCliente(clienteId)
    await prisma.chamado.create({
      data: {
        clienteId,
        empresaId:    empresaId ?? undefined,
        tipo:         'emissao_documento',
        origem:       'ia',
        visivelPortal: false,
        titulo:       tituloChamado,
        descricao:    descricaoChamado,
        prioridade:   'alta',
        status:       'aberta',
      },
    })
    logger.info('nfse-escalacao-garantida', { clienteId, titulo: tituloChamado })
  } catch (escErr) {
    // Nunca deixa o escalonamento derrubar a resposta — apenas loga
    logger.error('nfse-escalacao-falhou', { clienteId, escErr })
    Sentry.captureException(escErr, {
      tags:  { module: 'emitir-nota-fiscal-tool', operation: 'escalar-os' },
      extra: { clienteId },
    })
  }
}

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
      'SE RETORNAR ERRO: chame imediatamente criarChamado com tipo emissao_documento, incluindo todos os dados coletados, o motivo do erro e a mensagem original.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente. Use ctx.clienteId se disponível.',
        },
        ordemServicoId: {
          type: 'string',
          description: 'ID do chamado que originou a emissão (opcional).',
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
        dadosConfirmados: {
          type: 'boolean',
          description: 'OBRIGATÓRIO: deve ser `true`. Confirma que você apresentou todos os dados ao solicitante (descrição, valor, tomador, CPF/CNPJ) e recebeu confirmação explícita antes de emitir. NUNCA passe `true` sem ter apresentado e confirmado os dados com o solicitante.',
        },
        empresaId: {
          type: 'string',
          description: 'ID da empresa que presta o serviço. OBRIGATÓRIO quando o cliente tem mais de uma empresa. Use ctx.empresaId ou pergunte ao cliente qual empresa.',
        },
      },
      required: ['clienteId', 'descricao', 'valor', 'tomadorNome', 'tomadorCpfCnpj', 'dadosConfirmados'],
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
      dadosConfirmados:   z.literal(true, { message: 'Apresente os dados ao solicitante e aguarde confirmação antes de emitir.' }),
    }).safeParse(input)

    if (!parsed.success) {
      const issue = parsed.error.issues[0]!
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

    // Multi-empresa: se cliente tem N > 1, exige empresaId explícito
    const empresaIdInput = (input.empresaId as string) ?? ctx.empresaId
    if (!empresaIdInput) {
      const empresas = await resolverEmpresasDoCliente(clienteId)
      if (empresas.length > 1) {
        return {
          sucesso: false,
          erro:    'Cliente possui múltiplas empresas — informe qual empresa presta este serviço.',
          resumo:  `Este cliente tem ${empresas.length} empresas cadastradas:\n${formatarEmpresasParaTexto(empresas)}\n\nPor favor, pergunte ao cliente qual empresa deve emitir esta nota fiscal.`,
        }
      }
    }

    // Verifica se a integração NFS-e (Spedy) está configurada antes de coletar dados.
    // Evita conduzir o fluxo inteiro e só falhar no momento da emissão.
    try {
      const escritorio = await prisma.escritorio.findFirst({
        select: { spedyApiKey: true },
      })
      if (!escritorio?.spedyApiKey) {
        return {
          sucesso: false,
          erro:    'Integração NFS-e não configurada.',
          resumo:  'A emissão de nota fiscal não está disponível pois a integração com o provedor NFS-e (Spedy) não foi configurada. Acesse Configurações → Nota Fiscal para ativar.',
        }
      }
    } catch (cfgErr) {
      Sentry.captureException(cfgErr, {
        tags:  { module: 'emitir-nota-fiscal-tool', operation: 'verificar-config-spedy' },
        extra: { clienteId },
      })
      // Falha na verificação → deixa prosseguir; o serviço emitirNotaFiscal vai falhar com mensagem clara
    }

    try {
      const resultado = await emitirNotaFiscal({
        clienteId,
        empresaId:         empresaIdInput ?? undefined,
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
        // Escalonamento garantido por código — não depende da IA chamar criarChamado
        await escalarParaHumano(
          clienteId,
          `Falha na emissão de NFS-e — ${resultado.motivo}`,
          `Motivo: ${resultado.detalhe}\n\n` +
          `Dados coletados:\n` +
          `• Descrição: ${parsed.data.descricao}\n` +
          `• Valor: R$ ${parsed.data.valor.toFixed(2)}\n` +
          `• Tomador: ${parsed.data.tomadorNome} (${parsed.data.tomadorCpfCnpj})\n` +
          `• Email tomador: ${parsed.data.tomadorEmail ?? '—'}\n` +
          `• Município/UF: ${parsed.data.tomadorMunicipio ?? '—'}/${parsed.data.tomadorEstado ?? '—'}\n` +
          `• Chamado origem: ${parsed.data.ordemServicoId ?? '—'}`,
        )
        return {
          sucesso: false,
          dados:   resultado,
          erro:    resultado.detalhe,
          resumo:  `Emissão bloqueada (${resultado.motivo}): ${resultado.detalhe}. Um chamado de prioridade ALTA foi aberto automaticamente para a equipe.`,
        }
      }

      return {
        sucesso: true,
        dados:   resultado,
        resumo:  `NFS-e enviada para processamento. ${resultado.mensagem} ID interno: ${resultado.notaFiscalId}. Status: ${resultado.status}. Aguardando autorização da prefeitura — informarei quando autorizada.`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro interno'
      Sentry.captureException(err, {
        tags:  { module: 'emitir-nota-fiscal-tool', operation: 'execute' },
        extra: { clienteId },
      })
      // Escalonamento garantido mesmo em exceção inesperada
      await escalarParaHumano(
        clienteId,
        'Erro interno na emissão de NFS-e',
        `Erro técnico ao tentar emitir nota fiscal.\n\n` +
        `Mensagem: ${msg}\n\n` +
        `Dados coletados:\n` +
        `• Descrição: ${parsed.data.descricao}\n` +
        `• Valor: R$ ${parsed.data.valor.toFixed(2)}\n` +
        `• Tomador: ${parsed.data.tomadorNome} (${parsed.data.tomadorCpfCnpj})`,
      )
      return {
        sucesso: false,
        erro:    msg,
        resumo:  `Erro ao emitir nota fiscal: ${msg}. Um chamado de prioridade ALTA foi aberto automaticamente para a equipe.`,
      }
    }
  },
}

registrarTool(emitirNotaFiscalTool)
