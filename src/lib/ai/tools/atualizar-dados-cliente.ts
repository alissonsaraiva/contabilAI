import { prisma } from '@/lib/prisma'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const atualizarDadosClienteTool: Tool = {
  definition: {
    name: 'atualizarDadosCliente',
    description: 'Atualiza dados cadastrais de um cliente: telefone, e-mail, WhatsApp, endereço (cidade, UF, logradouro), responsável (contador atribuído) ou dia de vencimento. Use quando o operador informar uma mudança de contato ou dados do cliente. Não use para alterar plano, regime ou status — use as tools específicas para isso.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente a ser atualizado.',
        },
        telefone: {
          type: 'string',
          description: 'Novo telefone do cliente.',
        },
        whatsapp: {
          type: 'string',
          description: 'Novo número de WhatsApp do cliente.',
        },
        email: {
          type: 'string',
          description: 'Novo e-mail do cliente.',
        },
        cidade: {
          type: 'string',
          description: 'Nova cidade do cliente.',
        },
        uf: {
          type: 'string',
          description: 'Nova UF (sigla do estado) do cliente.',
        },
        logradouro: {
          type: 'string',
          description: 'Novo endereço do cliente.',
        },
        vencimentoDia: {
          type: 'number',
          description: 'Novo dia de vencimento do contrato (1-31).',
        },
        responsavelId: {
          type: 'string',
          description: 'ID do contador responsável pelo cliente.',
        },
        observacoes: {
          type: 'string',
          description: 'Observações internas sobre o cliente.',
        },
      },
      required: ['clienteId'],
    },
  },

  meta: {
    label: 'Atualizar dados do cliente',
    descricao: 'Atualiza telefone, e-mail, WhatsApp, endereço, responsável ou vencimento de um cliente.',
    categoria: 'Clientes',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId  = input.clienteId as string | undefined
    if (!clienteId) {
      return { sucesso: false, erro: 'clienteId obrigatório.', resumo: 'Atualização cancelada: clienteId não fornecido.' }
    }

    const campos: Record<string, unknown> = {}
    if (input.telefone      !== undefined) campos.telefone      = input.telefone
    if (input.whatsapp      !== undefined) campos.whatsapp      = input.whatsapp
    if (input.email         !== undefined) campos.email         = input.email
    if (input.cidade        !== undefined) campos.cidade        = input.cidade
    if (input.uf            !== undefined) campos.uf            = input.uf
    if (input.logradouro    !== undefined) campos.logradouro    = input.logradouro
    if (input.vencimentoDia !== undefined) campos.vencimentoDia = Number(input.vencimentoDia)
    if (input.responsavelId !== undefined) campos.responsavelId = input.responsavelId
    if (input.observacoes   !== undefined) campos.observacoes   = input.observacoes

    if (Object.keys(campos).length === 0) {
      return { sucesso: false, erro: 'Nenhum campo para atualizar.', resumo: 'Atualização cancelada: nenhum campo fornecido.' }
    }

    const cliente = await prisma.cliente.update({
      where:   { id: clienteId },
      data:    campos,
      include: {
        empresa: { select: { razaoSocial: true, cnpj: true, regime: true, nomeFantasia: true, socios: true } },
        clienteEmpresas: {
          include: { empresa: { select: { razaoSocial: true, cnpj: true, regime: true, nomeFantasia: true, socios: true } } },
          orderBy: { principal: 'desc' },
        },
      },
    }).catch(() => null)

    if (!cliente) {
      return { sucesso: false, erro: 'Cliente não encontrado.', resumo: 'Atualização falhou: cliente não encontrado.' }
    }

    // Resolve empresa principal (junção 1:N → fallback legado)
    const empPrincipal = cliente.clienteEmpresas[0]?.empresa ?? cliente.empresa

    // Reindexar no RAG para manter dados atualizados
    indexarAsync('cliente', {
      id:            cliente.id,
      nome:          cliente.nome,
      email:         cliente.email,
      cpf:           cliente.cpf,
      telefone:      cliente.telefone,
      whatsapp:      cliente.whatsapp,
      cnpj:          empPrincipal?.cnpj,
      razaoSocial:   empPrincipal?.razaoSocial,
      nomeFantasia:  empPrincipal?.nomeFantasia,
      regime:        empPrincipal?.regime,
      planoTipo:     cliente.planoTipo,
      valorMensal:   cliente.valorMensal,
      vencimentoDia: cliente.vencimentoDia,
      formaPagamento: cliente.formaPagamento,
      cidade:        cliente.cidade,
      uf:            cliente.uf,
      socios:        (empPrincipal?.socios ?? []) as any[],
    })

    const camposAlterados = Object.keys(campos).join(', ')
    return {
      sucesso: true,
      dados:   { clienteId: cliente.id, camposAlterados },
      resumo:  `Dados do cliente "${cliente.nome}" atualizados: ${camposAlterados}.`,
    }
  },
}

registrarTool(atualizarDadosClienteTool)
