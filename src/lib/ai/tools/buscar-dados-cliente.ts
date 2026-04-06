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
    canais: ['crm', 'whatsapp', 'portal'],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId = (input.clienteId as string | undefined) ?? ctx.clienteId
    let busca       = input.busca as string | undefined

    if (!clienteId && !busca) {
      return {
        sucesso: false,
        erro: 'Forneça clienteId ou busca (nome/CPF/CNPJ/email).',
        resumo: 'Não foi possível buscar o cliente: nenhum identificador fornecido.',
      }
    }

    // Segurança: canais não-CRM (portal, whatsapp, onboarding) só podem consultar
    // o cliente vinculado ao contexto da sessão — busca textual é bloqueada para
    // evitar vazamento de dados entre clientes.
    if (ctx.solicitanteAI !== 'crm') {
      if (!clienteId) {
        return {
          sucesso: false,
          erro: 'Identificação do cliente não disponível neste canal.',
          resumo: 'Não foi possível buscar o cliente: contexto de cliente não identificado.',
        }
      }
      // Força lookup exclusivo por clienteId — ignora qualquer parâmetro de busca textual
      // que poderia retornar dados de outro cliente.
      busca = undefined
    }

    // Normaliza CPF/CNPJ removendo formatação antes de buscar
    const buscaNorm = busca ? busca.replace(/[.\-\/\s]/g, '') : undefined

    const incluirCobranca = {
      cobrancasAsaas: {
        where:   { status: { in: ['PENDING', 'OVERDUE'] as import('@prisma/client').AsaasStatusCobranca[] } },
        orderBy: { vencimento: 'asc' as const },
        take:    1,
        select:  { id: true, valor: true, vencimento: true, status: true, formaPagamento: true, pixCopiaECola: true, linkBoleto: true },
      },
    }

    const cliente = clienteId
      ? await prisma.cliente.findUnique({
          where: { id: clienteId },
          include: {
            empresa: true,
            responsavel: { select: { nome: true } },
            interacoes: {
              where: ctx.solicitanteAI === 'portal'
                ? { tipo: { in: ['email_enviado', 'email_recebido', 'documento_enviado', 'status_mudou', 'whatsapp_enviado'] } }
                : undefined,
              select: { tipo: true, titulo: true, criadoEm: true },
              orderBy: { criadoEm: 'desc' },
              take: 5,
            },
            ...incluirCobranca,
          },
        })
      : await prisma.cliente.findFirst({
          where: {
            OR: [
              { nome:  { contains: busca!, mode: 'insensitive' } },
              { email: { contains: busca!, mode: 'insensitive' } },
              { empresa: { is: { razaoSocial: { contains: busca!, mode: 'insensitive' } } } },
              // Busca por CPF/CNPJ com ou sem formatação
              { cpf:  busca! },
              { empresa: { is: { cnpj: busca! } } },
              ...(buscaNorm && buscaNorm !== busca ? [
                { cpf: buscaNorm },
                { empresa: { is: { cnpj: buscaNorm } } },
              ] : []),
            ],
          },
          include: {
            empresa: true,
            responsavel: { select: { nome: true } },
            interacoes: {
              where: ctx.solicitanteAI === 'portal'
                ? { tipo: { in: ['email_enviado', 'email_recebido', 'documento_enviado', 'status_mudou', 'whatsapp_enviado'] } }
                : undefined,
              select: { tipo: true, titulo: true, criadoEm: true },
              orderBy: { criadoEm: 'desc' },
              take: 5,
            },
            ...incluirCobranca,
          },
        })

    if (!cliente) {
      return {
        sucesso: false,
        erro: 'Cliente não encontrado.',
        resumo: `Cliente não encontrado${busca ? ` para a busca "${busca}"` : ''}.`,
      }
    }

    const empresa = (cliente as any).empresa as { regime?: string; cnpj?: string; razaoSocial?: string; procuracaoRFAtiva?: boolean; procuracaoRFVerificadaEm?: Date | null } | null
    const cobrancaAberta = (cliente as any).cobrancasAsaas?.[0] as {
      id: string; valor: unknown; vencimento: Date; status: string;
      formaPagamento: string; pixCopiaECola: string | null; linkBoleto: string | null
    } | undefined

    const linhas: string[] = [
      `Cliente: ${cliente.nome}`,
      `Status: ${cliente.status}`,
      `Plano: ${cliente.planoTipo} — R$ ${cliente.valorMensal}/mês`,
      `Regime: ${empresa?.regime ?? 'não informado'}`,
      `Email: ${cliente.email}`,
      `Telefone: ${cliente.telefone}`,
      ...(empresa?.cnpj ? [`CNPJ: ${empresa.cnpj}`] : []),
      ...(empresa?.razaoSocial ? [`Razão social: ${empresa.razaoSocial}`] : []),
      ...(empresa?.regime === 'MEI' ? [
        `Procuração RF (e-CAC): ${empresa.procuracaoRFAtiva ? 'ativa' : 'PENDENTE — cliente ainda não concedeu procuração ao escritório'}`,
        ...(empresa.procuracaoRFVerificadaEm
          ? [`Última verificação RF: ${new Date(empresa.procuracaoRFVerificadaEm).toLocaleDateString('pt-BR')}`]
          : []),
      ] : []),
      `Responsável: ${(cliente as any).responsavel?.nome ?? 'não atribuído'}`,
      `Vencimento: dia ${cliente.vencimentoDia}`,
      `Pagamento: ${cliente.formaPagamento}`,
    ]

    // Situação financeira — inclui cobrança em aberto se existir
    if (cobrancaAberta) {
      const hoje       = new Date()
      const valorStr   = Number(cobrancaAberta.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      const vencStr    = new Date(cobrancaAberta.vencimento).toLocaleDateString('pt-BR')
      const diasAtraso = cobrancaAberta.vencimento < hoje
        ? Math.floor((hoje.getTime() - new Date(cobrancaAberta.vencimento).getTime()) / 86400000)
        : 0
      linhas.push(
        '',
        `Cobrança em aberto: ${valorStr} — vencto ${vencStr}${diasAtraso > 0 ? ` (${diasAtraso}d em atraso)` : ''}`,
        cobrancaAberta.pixCopiaECola
          ? `PIX: ${cobrancaAberta.pixCopiaECola}`
          : cobrancaAberta.linkBoleto
          ? `Boleto: ${cobrancaAberta.linkBoleto}`
          : 'Sem PIX/boleto registrado — gerar segunda via se necessário',
      )
    } else if (cliente.status === 'inadimplente') {
      linhas.push('', 'Situação financeira: inadimplente — nenhuma cobrança Asaas registrada (cliente sem subscription?)')
    }

    const interacoes = (cliente as any).interacoes as Array<{ tipo: string; titulo: string | null; criadoEm: Date }>
    if (interacoes.length > 0) {
      linhas.push('', 'Últimas interações:')
      interacoes.forEach(i => {
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
