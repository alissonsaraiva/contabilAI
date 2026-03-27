import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const buscarDadosClienteTool: Tool = {
  definition: {
    name: 'buscarDadosCliente',
    description: 'Busca dados completos de um cliente: cadastro, plano, status, responsável, tarefas em aberto e últimas interações. Use quando o operador perguntar sobre um cliente específico pelo nome, CPF, CNPJ ou email.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente (quando já disponível no contexto).',
        },
        busca: {
          type: 'string',
          description: 'Nome, CPF, CNPJ ou email do cliente para busca textual.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Buscar dados do cliente',
    descricao: 'Retorna perfil completo por nome, CPF, CNPJ ou e-mail — plano, status, últimas tarefas e interações.',
    categoria: 'Clientes',
    canais: ['crm', 'whatsapp', 'portal', 'onboarding'],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId = (input.clienteId as string | undefined) ?? ctx.clienteId
    const busca     = input.busca as string | undefined

    if (!clienteId && !busca) {
      return {
        sucesso: false,
        erro: 'Forneça clienteId ou busca (nome/CPF/CNPJ/email).',
        resumo: 'Não foi possível buscar o cliente: nenhum identificador fornecido.',
      }
    }

    const cliente = clienteId
      ? await prisma.cliente.findUnique({
          where: { id: clienteId },
          include: {
            responsavel: { select: { nome: true } },
            tarefas: {
              where: { status: { notIn: ['concluida', 'cancelada'] } },
              select: { id: true, titulo: true, prazo: true, prioridade: true, status: true },
              orderBy: { prazo: 'asc' },
              take: 5,
            },
            interacoes: {
              select: { tipo: true, titulo: true, criadoEm: true },
              orderBy: { criadoEm: 'desc' },
              take: 5,
            },
          },
        })
      : await prisma.cliente.findFirst({
          where: {
            OR: [
              { nome:        { contains: busca!, mode: 'insensitive' } },
              { email:       { contains: busca!, mode: 'insensitive' } },
              { cpf:         busca! },
              { cnpj:        busca! },
              { razaoSocial: { contains: busca!, mode: 'insensitive' } },
            ],
          },
          include: {
            responsavel: { select: { nome: true } },
            tarefas: {
              where: { status: { notIn: ['concluida', 'cancelada'] } },
              select: { id: true, titulo: true, prazo: true, prioridade: true, status: true },
              orderBy: { prazo: 'asc' },
              take: 5,
            },
            interacoes: {
              select: { tipo: true, titulo: true, criadoEm: true },
              orderBy: { criadoEm: 'desc' },
              take: 5,
            },
          },
        })

    if (!cliente) {
      return {
        sucesso: false,
        erro: 'Cliente não encontrado.',
        resumo: `Cliente não encontrado${busca ? ` para a busca "${busca}"` : ''}.`,
      }
    }

    const linhas: string[] = [
      `Cliente: ${cliente.nome}`,
      `Status: ${cliente.status}`,
      `Plano: ${cliente.planoTipo} — R$ ${cliente.valorMensal}/mês`,
      `Regime: ${cliente.regime ?? 'não informado'}`,
      `Email: ${cliente.email}`,
      `Telefone: ${cliente.telefone}`,
      ...(cliente.cnpj ? [`CNPJ: ${cliente.cnpj}`] : []),
      ...(cliente.razaoSocial ? [`Razão social: ${cliente.razaoSocial}`] : []),
      `Responsável: ${cliente.responsavel?.nome ?? 'não atribuído'}`,
      `Vencimento: dia ${cliente.vencimentoDia}`,
      `Pagamento: ${cliente.formaPagamento}`,
    ]

    if (cliente.tarefas.length > 0) {
      linhas.push('', `Tarefas em aberto (${cliente.tarefas.length}):`)
      cliente.tarefas.forEach(t => {
        const prazo = t.prazo ? ` — prazo: ${t.prazo.toLocaleDateString('pt-BR')}` : ''
        linhas.push(`• [${t.prioridade}] ${t.titulo}${prazo}`)
      })
    }

    if (cliente.interacoes.length > 0) {
      linhas.push('', 'Últimas interações:')
      cliente.interacoes.forEach(i => {
        const data = i.criadoEm.toLocaleDateString('pt-BR')
        linhas.push(`• ${data} — ${i.tipo}${i.titulo ? `: ${i.titulo}` : ''}`)
      })
    }

    return {
      sucesso: true,
      dados: cliente,
      resumo: linhas.join('\n'),
    }
  },
}

registrarTool(buscarDadosClienteTool)
