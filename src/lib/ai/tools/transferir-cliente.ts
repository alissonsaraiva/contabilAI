import { prisma } from '@/lib/prisma'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { registrarInteracao } from '@/lib/services/interacoes'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const transferirClienteTool: Tool = {
  definition: {
    name: 'transferirCliente',
    description: 'Transfere a responsabilidade de um cliente (ou lead) de um contador para outro. Use quando o operador precisar reatribuir um cliente por saída de colaborador, férias ou rebalanceamento de carteira. Registra a transferência como interação no histórico.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente a ser transferido.',
        },
        leadId: {
          type: 'string',
          description: 'ID do lead a ser transferido (alternativa ao clienteId).',
        },
        novoResponsavelId: {
          type: 'string',
          description: 'ID do usuário (contador/assistente) que assumirá a responsabilidade.',
        },
        novoResponsavelNome: {
          type: 'string',
          description: 'Nome do novo responsável (para busca quando o ID não é conhecido).',
        },
        motivo: {
          type: 'string',
          description: 'Motivo da transferência (ex: "férias do contador anterior", "rebalanceamento de carteira").',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Transferir cliente',
    descricao: 'Reatribui um cliente ou lead a outro contador, registrando a transferência no histórico.',
    categoria: 'Clientes',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId          = (input.clienteId as string | undefined) ?? ctx.clienteId
    const leadId             = (input.leadId    as string | undefined) ?? ctx.leadId
    const novoResponsavelId  = input.novoResponsavelId  as string | undefined
    const novoResponsavelNome = input.novoResponsavelNome as string | undefined
    const motivo             = (input.motivo as string | undefined) ?? 'Transferência solicitada pelo operador'

    if (!clienteId && !leadId) {
      return { sucesso: false, erro: 'Informe clienteId ou leadId.', resumo: 'Transferência cancelada: nenhum cliente/lead identificado.' }
    }

    // Resolve novoResponsavelId por nome se necessário
    let responsavelId = novoResponsavelId
    let responsavelNome = novoResponsavelNome ?? ''

    if (!responsavelId && novoResponsavelNome) {
      const usuario = await prisma.usuario.findFirst({
        where: {
          nome: { contains: novoResponsavelNome, mode: 'insensitive' },
          ativo: true,
        },
        select: { id: true, nome: true },
      }).catch(() => null)

      if (!usuario) {
        return { sucesso: false, erro: `Usuário "${novoResponsavelNome}" não encontrado.`, resumo: `Transferência cancelada: usuário "${novoResponsavelNome}" não encontrado.` }
      }
      responsavelId   = usuario.id
      responsavelNome = usuario.nome
    }

    if (!responsavelId) {
      return { sucesso: false, erro: 'Informe novoResponsavelId ou novoResponsavelNome.', resumo: 'Transferência cancelada: novo responsável não identificado.' }
    }

    // Busca nome do responsável se não foi fornecido
    if (!responsavelNome) {
      const u = await prisma.usuario.findUnique({ where: { id: responsavelId }, select: { nome: true } }).catch(() => null)
      responsavelNome = u?.nome ?? responsavelId
    }

    let nomeEntidade = ''

    if (clienteId) {
      const cliente = await prisma.cliente.update({
        where: { id: clienteId },
        data:  { responsavelId },
        select: { id: true, nome: true, email: true, telefone: true, whatsapp: true, planoTipo: true, valorMensal: true, vencimentoDia: true, formaPagamento: true, cidade: true, uf: true, empresa: { select: { razaoSocial: true, cnpj: true, regime: true, nomeFantasia: true, socios: true } }, clienteEmpresas: { include: { empresa: { select: { razaoSocial: true, cnpj: true, regime: true, nomeFantasia: true, socios: true } } }, orderBy: { principal: 'desc' } } },
      }).catch(() => null)

      if (!cliente) return { sucesso: false, erro: 'Cliente não encontrado.', resumo: 'Transferência cancelada: cliente não encontrado.' }
      const empPrincipal = cliente.clienteEmpresas[0]?.empresa ?? cliente.empresa
      nomeEntidade = empPrincipal?.razaoSocial ?? cliente.nome

      // Registrar interação de transferência (service garante indexação RAG)
      registrarInteracao({
        clienteId,
        tipo:    'nota_interna',
        titulo:  'Transferência de responsável',
        conteudo: `${motivo}. Novo responsável: ${responsavelNome}.`,
        origem:  'ia',
        metadados: { solicitanteAI: ctx.solicitanteAI, responsavelId, responsavelNome },
      }).catch((err: unknown) =>
        console.error('[tool/transferir-cliente] erro ao registrar interação:', { clienteId, err }),
      )

      indexarAsync('cliente', {
        id: cliente.id, nome: cliente.nome, email: cliente.email,
        telefone: cliente.telefone, whatsapp: cliente.whatsapp,
        cnpj: empPrincipal?.cnpj, razaoSocial: empPrincipal?.razaoSocial,
        nomeFantasia: empPrincipal?.nomeFantasia, regime: empPrincipal?.regime,
        planoTipo: cliente.planoTipo, valorMensal: cliente.valorMensal,
        vencimentoDia: cliente.vencimentoDia, formaPagamento: cliente.formaPagamento,
        cidade: cliente.cidade, uf: cliente.uf,
        socios: (empPrincipal?.socios ?? []) as any[],
      })

    } else if (leadId) {
      const lead = await prisma.lead.update({
        where: { id: leadId },
        data:  { responsavelId },
        select: { id: true, contatoEntrada: true },
      }).catch(() => null)

      if (!lead) return { sucesso: false, erro: 'Lead não encontrado.', resumo: 'Transferência cancelada: lead não encontrado.' }
      nomeEntidade = lead.contatoEntrada
    }

    return {
      sucesso: true,
      dados:   { responsavelId, responsavelNome, clienteId, leadId },
      resumo:  `${nomeEntidade} transferido(a) para ${responsavelNome}. Motivo: ${motivo}.`,
    }
  },
}

registrarTool(transferirClienteTool)
