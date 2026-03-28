import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

// Tipos de interação visíveis ao cliente via portal — notas internas e chamadas são CRM-only
const TIPOS_PORTAL = ['email_enviado', 'email_recebido', 'documento_enviado', 'status_mudou']

const buscarHistoricoTool: Tool = {
  definition: {
    name: 'buscarHistorico',
    description:
      'Busca o histórico de interações de um cliente ou lead (ligações, e-mails, notas, mensagens WhatsApp). Use quando o operador disser "mostra o histórico do cliente", "o que aconteceu com esse lead", "tem alguma nota sobre X", "últimas interações", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente. Use quando for um cliente ativo.',
        },
        leadId: {
          type: 'string',
          description: 'ID do lead. Use quando for um lead em prospecção/onboarding.',
        },
        limite: {
          type: 'number',
          description: 'Quantidade máxima de interações a retornar. Default: 10.',
        },
        tipo: {
          type: 'string',
          description: 'Filtrar por tipo: ligacao, email_enviado, email_recebido, nota_interna, whatsapp_enviado, status_mudou. Separar por vírgula para múltiplos tipos.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Buscar histórico',
    descricao: 'Retorna as últimas interações de um cliente ou lead: ligações, e-mails, notas e mensagens.',
    categoria: 'Histórico',
    canais: ['crm', 'whatsapp', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId = (input.clienteId as string | undefined) ?? ctx.clienteId
    const leadId    = (input.leadId    as string | undefined) ?? ctx.leadId
    const limite    = (input.limite    as number | undefined) ?? 10
    const tipoRaw   = input.tipo as string | undefined

    // No portal, restringe aos tipos que o cliente pode ver
    const tiposPermitidos = ctx.solicitanteAI === 'portal' ? TIPOS_PORTAL : null

    const tiposSolicitados = tipoRaw ? tipoRaw.split(',').map(t => t.trim()).filter(Boolean) : []

    // Intersecta tipos solicitados com os permitidos (no portal filtra sempre)
    const tipos = tiposPermitidos
      ? (tiposSolicitados.length > 0 ? tiposSolicitados.filter(t => tiposPermitidos.includes(t)) : tiposPermitidos)
      : tiposSolicitados

    if (!clienteId && !leadId) {
      return {
        sucesso: false,
        erro:   'clienteId ou leadId não fornecido.',
        resumo: 'Não foi possível buscar histórico: cliente ou lead não identificado.',
      }
    }

    const interacoes = await prisma.interacao.findMany({
      where: {
        ...(clienteId && { clienteId }),
        ...(leadId    && { leadId }),
        ...(tipos.length > 0 && { tipo: { in: tipos } }),
      },
      orderBy: { criadoEm: 'desc' },
      take:    limite,
      select: {
        id:        true,
        tipo:      true,
        titulo:    true,
        conteudo:  true,
        criadoEm:  true,
        usuario:   { select: { nome: true } },
      },
    })

    if (interacoes.length === 0) {
      return {
        sucesso: true,
        dados:   [],
        resumo:  'Nenhuma interação registrada para este contato.',
      }
    }

    const tipoLabel: Record<string, string> = {
      ligacao:          'Ligação',
      email_enviado:    'E-mail enviado',
      email_recebido:   'E-mail recebido',
      nota_interna:     'Nota interna',
      whatsapp_enviado: 'WhatsApp',
      status_mudou:     'Mudança de status',
    }

    const linhas = interacoes.map(i => {
      const data    = new Date(i.criadoEm).toLocaleDateString('pt-BR')
      const tipo    = tipoLabel[i.tipo as string] ?? i.tipo
      const autor   = i.usuario?.nome ? ` (${i.usuario.nome})` : ''
      const detalhe = i.conteudo ? ` — ${i.conteudo.slice(0, 60)}${i.conteudo.length > 60 ? '...' : ''}` : ''
      return `• [${data}] ${tipo}${autor}: ${i.titulo}${detalhe}`
    })

    return {
      sucesso: true,
      dados:   interacoes,
      resumo:  [`Últimas ${interacoes.length} interações:`, ...linhas].join('\n'),
    }
  },
}

registrarTool(buscarHistoricoTool)
