import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const buscarEmailInboxTool: Tool = {
  definition: {
    name: 'buscarEmailInbox',
    description: 'Busca e-mails recebidos (inbox) com filtros por remetente, assunto, período ou cliente. Use quando o operador perguntar "o cliente enviou algum e-mail sobre X?" ou precisar localizar uma comunicação recebida por e-mail. Retorna até 10 resultados mais recentes.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'Filtrar e-mails de um cliente específico.',
        },
        de: {
          type: 'string',
          description: 'Filtrar por remetente (nome ou e-mail parcial).',
        },
        assunto: {
          type: 'string',
          description: 'Filtrar por trecho do assunto.',
        },
        corpo: {
          type: 'string',
          description: 'Filtrar por trecho do corpo do e-mail.',
        },
        dataInicio: {
          type: 'string',
          description: 'Data de início da busca (formato YYYY-MM-DD).',
        },
        dataFim: {
          type: 'string',
          description: 'Data de fim da busca (formato YYYY-MM-DD).',
        },
        apenasNaoLidos: {
          type: 'boolean',
          description: 'Retornar apenas e-mails não classificados/respondidos.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Buscar e-mail inbox',
    descricao: 'Busca e-mails recebidos com filtros por remetente, assunto, período ou cliente.',
    categoria: 'Comunicação',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId     = (input.clienteId as string | undefined) ?? ctx.clienteId
    const de            = input.de      as string | undefined
    const assunto       = input.assunto as string | undefined
    const corpo         = input.corpo   as string | undefined
    const dataInicio    = input.dataInicio as string | undefined
    const dataFim       = input.dataFim    as string | undefined
    const apenasNaoLidos = input.apenasNaoLidos as boolean | undefined

    // Busca interações do tipo email_recebido no banco
    // As interações de email ficam na tabela Interacao com tipo='email_recebido'
    const where: Record<string, unknown> = {
      tipo: 'email_recebido',
    }

    if (clienteId) where.clienteId = clienteId

    if (assunto || corpo) {
      where.OR = [
        assunto ? { titulo:  { contains: assunto, mode: 'insensitive' } } : null,
        corpo   ? { conteudo: { contains: corpo,   mode: 'insensitive' } } : null,
      ].filter(Boolean)
    }

    if (dataInicio || dataFim) {
      where.criadoEm = {}
      if (dataInicio) (where.criadoEm as any).gte = new Date(dataInicio)
      if (dataFim)    (where.criadoEm as any).lte = new Date(dataFim + 'T23:59:59')
    }

    if (apenasNaoLidos) {
      where.respondidoPorId = null
    }

    const interacoes = await prisma.interacao.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take:    10,
      select: {
        id:       true,
        titulo:   true,
        conteudo: true,
        criadoEm: true,
        clienteId: true,
        cliente:  { select: { nome: true } },
      },
    }).catch(() => [])

    // Filtro por remetente (no conteúdo — e-mails têm "De: X" no conteúdo indexado)
    const filtrados = de
      ? interacoes.filter(i =>
          i.conteudo?.toLowerCase().includes(de.toLowerCase()) ||
          i.titulo?.toLowerCase().includes(de.toLowerCase())
        )
      : interacoes

    if (filtrados.length === 0) {
      return {
        sucesso: true,
        dados:   [],
        resumo:  'Nenhum e-mail encontrado com os filtros informados.',
      }
    }

    const linhas = filtrados.map(i => {
      const data   = i.criadoEm.toLocaleDateString('pt-BR')
      const cliente = i.cliente?.nome ? ` (${i.cliente.nome})` : ''
      const preview = i.conteudo?.slice(0, 120).replace(/\n/g, ' ') ?? ''
      return `• ${data}${cliente} — ${i.titulo ?? 'sem assunto'}\n  ${preview}...`
    })

    return {
      sucesso: true,
      dados:   filtrados,
      resumo:  `${filtrados.length} e-mail(s) encontrado(s):\n\n${linhas.join('\n\n')}`,
    }
  },
}

registrarTool(buscarEmailInboxTool)
