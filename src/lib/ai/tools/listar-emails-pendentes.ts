import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const listarEmailsPendentesTool: Tool = {
  definition: {
    name: 'listarEmailsPendentes',
    description:
      'Lista e-mails recebidos pelo escritório que ainda não foram respondidos ou dispensados. Use quando perguntarem "tem algum email sem resposta?", "quantos emails pendentes?", "o cliente X nos enviou email?", "quais emails estão aguardando?". Inclui sugestão de resposta da IA quando disponível.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'Filtra e-mails de um cliente específico. Se omitido, lista de todos.',
        },
        limite: {
          type: 'number',
          description: 'Máximo de e-mails a retornar. Default: 10.',
        },
        incluirRespondidos: {
          type: 'boolean',
          description: 'Se true, inclui também os e-mails já respondidos/dispensados. Default: false.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Listar e-mails pendentes',
    descricao: 'Consulta a caixa de entrada do escritório e retorna e-mails recebidos não respondidos, com remetente, assunto, corpo e sugestão da IA.',
    categoria: 'Clientes',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId         = (input.clienteId         as string  | undefined) ?? ctx.clienteId
    const limite            = Math.min(Number(input.limite ?? 10), 30)
    const incluirRespondidos = !!(input.incluirRespondidos as boolean | undefined)

    const where: Record<string, unknown> = {
      tipo: 'email_recebido',
      ...(incluirRespondidos ? {} : { respondidoEm: null }),
      ...(clienteId ? { clienteId } : {}),
    }

    const emails = await prisma.interacao.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take: limite,
      include: {
        cliente: { select: { id: true, nome: true, email: true } },
        lead:    { select: { id: true, contatoEntrada: true } },
      },
    })

    if (emails.length === 0) {
      const msg = clienteId
        ? `Nenhum e-mail ${incluirRespondidos ? '' : 'pendente '}encontrado para este cliente.`
        : `Nenhum e-mail ${incluirRespondidos ? '' : 'pendente '}na caixa de entrada.`
      return { sucesso: true, dados: { emails: [] }, resumo: msg }
    }

    const resultado = emails.map(e => {
      const meta = (e.metadados ?? {}) as Record<string, unknown>
      return {
        id:           e.id,
        de:           meta.de            as string ?? '',
        nomeRemetente: meta.nomeRemetente as string | null ?? null,
        assunto:      meta.assunto       as string ?? e.titulo ?? '(sem assunto)',
        corpo:        e.conteudo ? e.conteudo.slice(0, 300) : null,
        dataRecebido: e.criadoEm.toLocaleDateString('pt-BR'),
        respondido:   !!(e as any).respondidoEm,
        temSugestao:  !!(meta.sugestao as string | null),
        sugestao:     (meta.sugestao as string | null) ?? null,
        cliente:      e.cliente?.nome ?? e.lead?.contatoEntrada ?? null,
        temAnexos:    Array.isArray(meta.anexos) && (meta.anexos as unknown[]).length > 0,
      }
    })

    const pendentes = resultado.filter(e => !e.respondido).length
    const resumo = clienteId
      ? `${emails.length} e-mail(s) encontrado(s) para este cliente — ${pendentes} pendente(s) de resposta.`
      : `${emails.length} e-mail(s) na caixa de entrada — ${pendentes} pendente(s). ${
          resultado.filter(e => e.temSugestao).length
        } com sugestão da IA pronta.`

    return { sucesso: true, dados: { emails: resultado, totalPendentes: pendentes }, resumo }
  },
}

registrarTool(listarEmailsPendentesTool)
