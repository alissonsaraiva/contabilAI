import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { unaccentSearch } from '@/lib/search'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

/**
 * Busca tomadores (destinatários de NFS-e) que esse cliente já usou antes.
 * Permite que a IA pré-preencha os dados do tomador a partir do histórico,
 * evitando pedir ao cliente informações que ele já forneceu anteriormente.
 */
const buscarTomadoresRecorrentesTool: Tool = {
  definition: {
    name: 'buscarTomadoresRecorrentes',
    description:
      'Busca os tomadores (destinatários de NFS-e) que o cliente já usou anteriormente. ' +
      'QUANDO USAR: antes de emitir uma nova NFS-e, chame esta tool para ver se o tomador já foi usado antes. ' +
      'Se o cliente mencionar o nome da empresa/pessoa do tomador, use busca por texto. ' +
      'Retorna nome, CPF/CNPJ, e-mail, município e estado de cada tomador recorrente. ' +
      'Com esses dados em mãos, confirme com o cliente se quer usar os mesmos dados ou corrigir algum campo antes de chamar emitirNotaFiscal.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente cujo histórico de tomadores será buscado. Use ctx.clienteId se disponível.',
        },
        busca: {
          type: 'string',
          description: 'Texto para filtrar tomadores por nome ou CPF/CNPJ (opcional). Ex: "Petrobras" ou "33000167".',
        },
        limite: {
          type: 'number',
          description: 'Máximo de tomadores a retornar (padrão: 10, máximo: 20).',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Buscar tomadores recorrentes',
    descricao: 'Busca tomadores (destinatários de NFS-e) que o cliente já usou em notas anteriores.',
    categoria: 'Nota Fiscal',
    canais: ['crm', 'whatsapp', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const parsed = z.object({
      clienteId: z.string().min(1).optional(),
      busca:     z.string().max(100).optional(),
      limite:    z.number().int().min(1).max(20).default(10),
    }).safeParse(input)

    if (!parsed.success) {
      return {
        sucesso: false,
        erro:    `Parâmetro inválido: ${parsed.error.issues[0]?.message}`,
        resumo:  'Parâmetros inválidos para busca de tomadores.',
      }
    }

    const clienteId = parsed.data.clienteId ?? ctx.clienteId
    if (!clienteId) {
      return { sucesso: false, erro: 'clienteId obrigatório', resumo: 'Cliente não identificado.' }
    }

    try {
      // Busca notas autorizadas deste cliente e agrupa tomadores únicos por CPF/CNPJ
      const notas = await prisma.notaFiscal.findMany({
        where: {
          clienteId,
          status:         { in: ['autorizada', 'cancelada'] },
          tomadorCpfCnpj: { not: null },
          tomadorNome:    { not: null },
          ...(parsed.data.busca ? {
            id: { in: await unaccentSearch({
              sql: `SELECT id FROM notas_fiscais WHERE f_unaccent("tomadorNome") ILIKE f_unaccent($1) OR "tomadorCpfCnpj" LIKE $2`,
              term: parsed.data.busca!,
              extraParams: [`%${parsed.data.busca!.replace(/\D/g, '')}%`],
            }) },
          } : {}),
        },
        orderBy: { criadoEm: 'desc' },
        select: {
          tomadorNome:     true,
          tomadorCpfCnpj:  true,
          tomadorEmail:    true,
          tomadorMunicipio: true,
          tomadorEstado:   true,
          criadoEm:        true,
        },
        take: parsed.data.limite * 5, // busca mais para desduplicar
      })

      // Deduplicação por CPF/CNPJ — mantém o mais recente de cada tomador
      const vistos = new Map<string, typeof notas[0]>()
      for (const nota of notas) {
        const chave = nota.tomadorCpfCnpj ?? nota.tomadorNome ?? ''
        if (!vistos.has(chave)) {
          vistos.set(chave, nota)
        }
      }

      const tomadores = Array.from(vistos.values())
        .slice(0, parsed.data.limite)
        .map(n => ({
          nome:      n.tomadorNome,
          cpfCnpj:   n.tomadorCpfCnpj,
          email:     n.tomadorEmail,
          municipio: n.tomadorMunicipio,
          estado:    n.tomadorEstado,
          ultimaUso: n.criadoEm.toISOString().slice(0, 10),
        }))

      if (tomadores.length === 0) {
        return {
          sucesso: true,
          dados:   [],
          resumo:  parsed.data.busca
            ? `Nenhum tomador encontrado para "${parsed.data.busca}". Solicite os dados completos ao cliente.`
            : 'Este cliente ainda não emitiu notas fiscais. Solicite os dados do tomador para a primeira emissão.',
        }
      }

      return {
        sucesso: true,
        dados:   tomadores,
        resumo:  `Encontrei ${tomadores.length} tomador(es) recorrente(s). Confirme com o cliente qual deseja usar ou se os dados precisam de atualização antes de emitir.`,
      }
    } catch (err) {
      Sentry.captureException(err, {
        tags:  { module: 'buscar-tomadores-recorrentes-tool', operation: 'execute' },
        extra: { clienteId },
      })
      const msg = err instanceof Error ? err.message : 'Erro interno'
      return {
        sucesso: false,
        erro:    msg,
        resumo:  `Erro ao buscar histórico de tomadores: ${msg}`,
      }
    }
  },
}

registrarTool(buscarTomadoresRecorrentesTool)
