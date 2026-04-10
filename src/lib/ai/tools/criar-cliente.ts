import { prisma } from '@/lib/prisma'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { vincularEmpresa } from '@/lib/clientes/vincular-empresa'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const criarClienteTool: Tool = {
  definition: {
    name: 'criarCliente',
    description:
      'Cria um novo cliente ativo no sistema a partir dos dados fornecidos. Use quando o operador disser "cadastra o cliente", "converte esse lead em cliente", "cria um cliente com esses dados", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        nome: {
          type: 'string',
          description: 'Nome completo do cliente.',
        },
        cpf: {
          type: 'string',
          description: 'CPF do cliente (somente números ou formatado).',
        },
        email: {
          type: 'string',
          description: 'E-mail do cliente.',
        },
        telefone: {
          type: 'string',
          description: 'Telefone/WhatsApp do cliente.',
        },
        planoTipo: {
          type: 'string',
          enum: ['essencial', 'profissional', 'empresarial', 'startup'],
          description: 'Plano contratado.',
        },
        valorMensal: {
          type: 'number',
          description: 'Valor mensal da mensalidade em R$.',
        },
        vencimentoDia: {
          type: 'number',
          description: 'Dia do mês para vencimento (1-31).',
        },
        formaPagamento: {
          type: 'string',
          enum: ['pix', 'boleto', 'cartao'],
          description: 'Forma de pagamento.',
        },
        cnpj: {
          type: 'string',
          description: 'CNPJ da empresa (opcional).',
        },
        razaoSocial: {
          type: 'string',
          description: 'Razão social da empresa (opcional).',
        },
        regime: {
          type: 'string',
          enum: ['MEI', 'SimplesNacional', 'LucroPresumido', 'LucroReal', 'Autonomo'],
          description: 'Regime tributário (opcional).',
        },
        tipoContribuinte: {
          type: 'string',
          enum: ['pj', 'pf'],
          description: 'pj = tem empresa/CNPJ; pf = autônomo/profissional liberal sem empresa. Default: pj.',
        },
        profissao: {
          type: 'string',
          description: 'Profissão do cliente PF (ex: Médico, Dentista, Advogado). Obrigatório quando tipoContribuinte = pf.',
        },
        cidade: {
          type: 'string',
          description: 'Cidade (opcional).',
        },
        leadId: {
          type: 'string',
          description: 'ID do lead de origem para vincular (opcional).',
        },
      },
      required: ['nome', 'cpf', 'email', 'telefone', 'planoTipo', 'valorMensal', 'vencimentoDia', 'formaPagamento'],
    },
  },

  meta: {
    label: 'Criar cliente',
    descricao: 'Cadastra um novo cliente ativo com plano, valor e forma de pagamento.',
    categoria: 'Clientes',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const nome           = input.nome           as string
    const cpf            = input.cpf            as string
    const email          = input.email          as string
    const telefone       = input.telefone       as string
    const planoTipo      = input.planoTipo      as string
    const valorMensal    = input.valorMensal    as number
    const vencimentoDia  = input.vencimentoDia  as number
    const formaPagamento = input.formaPagamento as string
    const cnpj             = input.cnpj             as string | undefined
    const razaoSocial      = input.razaoSocial      as string | undefined
    const regime           = input.regime           as string | undefined
    const tipoContribuinte = (input.tipoContribuinte as string | undefined) ?? 'pj'
    const profissao        = input.profissao        as string | undefined
    const cidade           = input.cidade           as string | undefined
    const leadId           = input.leadId           as string | undefined

    try {
      // PF = autônomo sem empresa; PJ = tem empresa/CNPJ
      const isPF       = tipoContribuinte === 'pf' || regime === 'Autonomo'
      const temEmpresa = !isPF && !!(cnpj || razaoSocial || regime)

      const cliente = await prisma.$transaction(async (tx) => {
        const novoCliente = await tx.cliente.create({
          data: {
            nome,
            cpf,
            email,
            telefone,
            whatsapp:         telefone,
            planoTipo:        planoTipo        as never,
            valorMensal,
            vencimentoDia,
            formaPagamento:   formaPagamento   as never,
            tipoContribuinte: tipoContribuinte as never,
            status:           'ativo',
            dataInicio:       new Date(),
            ...(cidade    && { cidade }),
            ...(leadId    && { leadId }),
            ...(profissao && { profissao }),
          },
        })

        if (temEmpresa) {
          const empresa = await tx.empresa.create({
            data: {
              ...(cnpj        && { cnpj }),
              ...(razaoSocial && { razaoSocial }),
              ...(regime      && { regime: regime as never }),
            },
          })
          await vincularEmpresa(tx, novoCliente.id, empresa.id)
          return { ...novoCliente, empresaId: empresa.id }
        }

        return novoCliente
      })

      indexarAsync('cliente', cliente)

      return {
        sucesso: true,
        dados:   { clienteId: cliente.id },
        resumo:  `Cliente "${nome}" criado com sucesso. Plano ${planoTipo}, R$${valorMensal}/mês, vencimento dia ${vencimentoDia}.`,
      }
    } catch (err: unknown) {
      if ((err as any)?.code === 'P2002') {
        return {
          sucesso: false,
          erro:   'CPF ou e-mail já cadastrado.',
          resumo: `Não foi possível criar o cliente: CPF ou e-mail já existe no sistema.`,
        }
      }
      throw err
    }
  },
}

registrarTool(criarClienteTool)
