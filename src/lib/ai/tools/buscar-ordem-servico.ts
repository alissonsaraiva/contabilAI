import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const buscarOrdemServicoTool: Tool = {
  definition: {
    name: 'buscarOrdemServico',
    description:
      'Busca um chamado (ordem de serviço) específico pelo número (#42), pelo UUID ou por trecho do título. Use quando o cliente ou operador mencionar um número de chamado (ex: "meu chamado #12", "chamado número 5") ou quando precisar dos detalhes de um chamado específico antes de responder ou atualizar.',
    inputSchema: {
      type: 'object',
      properties: {
        numero: {
          type: 'number',
          description: 'Número sequencial do chamado (ex: 42). Tem prioridade sobre os outros filtros.',
        },
        id: {
          type: 'string',
          description: 'UUID do chamado. Use quando já tiver o ID completo.',
        },
        titulo: {
          type: 'string',
          description: 'Trecho do título para busca textual. Retorna até 5 resultados mais relevantes.',
        },
        clienteId: {
          type: 'string',
          description: 'Filtra pelo cliente. Combinável com titulo para restringir a busca.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Buscar chamado por número',
    descricao: 'Busca um chamado pelo número (#), UUID ou trecho do título. Retorna detalhes completos.',
    categoria: 'Chamados',
    canais: ['crm', 'whatsapp', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const parsed = z.object({
      numero:    z.number().int().positive().optional(),
      id:        z.string().max(200).optional(),
      titulo:    z.string().max(500).optional(),
      clienteId: z.string().max(200).optional(),
    }).safeParse(input)

    if (!parsed.success) {
      return { sucesso: false, erro: `Parâmetros inválidos: ${parsed.error.issues[0].message}`, resumo: 'Parâmetros inválidos.' }
    }

    const { numero, id, titulo, clienteId } = parsed.data

    // Segurança: no portal, sempre restringe ao cliente da sessão
    const clienteIdEfetivo = ctx.solicitanteAI === 'portal'
      ? ctx.clienteId
      : (clienteId ?? ctx.clienteId)

    // ── Busca por número ou ID (retorna um único chamado) ──
    if (numero !== undefined || id) {
      const where: any = {}
      if (numero !== undefined) where.numero = numero
      else if (id)              where.id     = id

      // Segurança no portal: garante que o chamado pertence ao cliente
      if (ctx.solicitanteAI === 'portal' && clienteIdEfetivo) {
        where.clienteId = clienteIdEfetivo
      }

      const os = await prisma.ordemServico.findFirst({
        where,
        include: {
          cliente:  { select: { nome: true, email: true } },
          empresa:  { select: { razaoSocial: true, nomeFantasia: true } },
          documentos: { select: { id: true, nome: true, url: true, criadoEm: true }, orderBy: { criadoEm: 'desc' }, take: 5 },
        },
      })

      if (!os) {
        const ref = numero !== undefined ? `#${numero}` : `ID ${id}`
        return {
          sucesso: false,
          dados:   null,
          resumo:  `Chamado ${ref} não encontrado${ctx.solicitanteAI === 'portal' ? ' (ou não pertence a esta conta)' : ''}.`,
        }
      }

      const empresa = os.empresa?.razaoSocial ?? os.empresa?.nomeFantasia ?? ''
      const resumo = [
        `Chamado #${os.numero} — "${os.titulo}"`,
        `Cliente: ${os.cliente.nome}${empresa ? ` / ${empresa}` : ''}`,
        `Status: ${os.status} | Tipo: ${os.tipo} | Prioridade: ${os.prioridade}`,
        `Criado em: ${new Date(os.criadoEm).toLocaleDateString('pt-BR')}`,
        os.resposta ? `Resposta: ${os.resposta.slice(0, 200)}${os.resposta.length > 200 ? '...' : ''}` : 'Sem resposta ainda.',
        os.documentos.length > 0 ? `Documentos vinculados: ${os.documentos.map(d => d.nome).join(', ')}` : '',
      ].filter(Boolean).join('\n')

      return { sucesso: true, dados: os, resumo }
    }

    // ── Busca por título (retorna lista) ──
    if (titulo) {
      const where: any = {
        titulo: { contains: titulo, mode: 'insensitive' },
      }
      if (clienteIdEfetivo) where.clienteId = clienteIdEfetivo

      const ordens = await prisma.ordemServico.findMany({
        where,
        orderBy: [{ criadoEm: 'desc' }],
        take:    5,
        include: {
          cliente: { select: { nome: true } },
        },
      })

      if (ordens.length === 0) {
        return { sucesso: true, dados: [], resumo: `Nenhum chamado encontrado com título contendo "${titulo}".` }
      }

      const linhas = ordens.map(o =>
        `- #${o.numero} [${o.status.toUpperCase()}] "${o.titulo}" (${o.cliente.nome}) — ${new Date(o.criadoEm).toLocaleDateString('pt-BR')}`
      )

      return {
        sucesso: true,
        dados:   ordens,
        resumo:  `${ordens.length} chamado(s) encontrado(s) com "${titulo}":\n${linhas.join('\n')}`,
      }
    }

    return {
      sucesso: false,
      erro:    'Informe ao menos um dos parâmetros: numero, id ou titulo.',
      resumo:  'Parâmetros insuficientes para busca.',
    }
  },
}

registrarTool(buscarOrdemServicoTool)
