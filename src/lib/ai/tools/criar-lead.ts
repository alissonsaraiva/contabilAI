import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const criarLeadTool: Tool = {
  definition: {
    name: 'criarLead',
    description:
      'Cria um novo lead no funil de prospecção ou onboarding. Use quando o operador disser "cadastra um lead", "cria um prospect com esse contato", "alguém me ligou interessado, anota aqui", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        contatoEntrada: {
          type: 'string',
          description: 'Contato principal do lead: e-mail, telefone ou nome. Campo de identificação inicial.',
        },
        canal: {
          type: 'string',
          enum: ['site', 'whatsapp', 'indicacao', 'instagram', 'google', 'outro'],
          description: 'Canal de origem do lead. Default: "outro".',
        },
        funil: {
          type: 'string',
          enum: ['prospeccao', 'onboarding'],
          description: 'Funil de destino. Default: "prospeccao".',
        },
        observacoes: {
          type: 'string',
          description: 'Observações iniciais sobre o lead (opcional).',
        },
      },
      required: ['contatoEntrada'],
    },
  },

  meta: {
    label: 'Criar lead',
    descricao: 'Registra um novo lead no funil de prospecção ou onboarding com canal de origem.',
    categoria: 'Funil',
    canais: ['crm', 'whatsapp'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const contatoEntrada = input.contatoEntrada as string
    const canal          = (input.canal        as string | undefined) ?? 'outro'
    const funil          = (input.funil        as string | undefined) ?? 'prospeccao'
    const observacoes    = input.observacoes   as string | undefined

    // Verifica se já existe um lead ativo com o mesmo contato no mesmo funil
    const existing = await prisma.lead.findFirst({
      where: {
        contatoEntrada,
        funil:  funil as never,
        status: { notIn: ['cancelado', 'expirado'] },
      },
      orderBy: { criadoEm: 'desc' },
    })

    if (existing) {
      return {
        sucesso: true,
        dados:   { leadId: existing.id, retomado: true },
        resumo:  `Lead com contato "${contatoEntrada}" já existe no funil "${funil}" (retomado). Status atual: ${existing.status}.`,
      }
    }

    const lead = await prisma.lead.create({
      data: {
        contatoEntrada,
        canal:       canal as never,
        funil:       funil as never,
        observacoes,
      },
    })

    import('@/lib/rag/ingest').then(({ indexarLead }) => indexarLead(lead)).catch(() => {})

    return {
      sucesso: true,
      dados:   { leadId: lead.id, retomado: false },
      resumo:  `Lead "${contatoEntrada}" criado no funil "${funil}" via canal "${canal}".`,
    }
  },
}

registrarTool(criarLeadTool)
