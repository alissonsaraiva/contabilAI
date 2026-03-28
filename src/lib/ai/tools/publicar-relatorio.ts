import { prisma } from '@/lib/prisma'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const publicarRelatorioTool: Tool = {
  definition: {
    name: 'publicarRelatorio',
    description:
      'Publica um relatório no painel de relatórios do CRM para que o operador possa consultá-lo depois. Use quando o operador pedir para gerar um relatório, resumo ou análise que deve ficar salvo — ex: "gera o relatório do funil e salva no painel", "cria um relatório mensal de clientes". O conteúdo deve ser em markdown formatado, com títulos, listas e tabelas quando necessário.',
    inputSchema: {
      type: 'object',
      properties: {
        titulo: {
          type: 'string',
          description: 'Título descritivo do relatório. Ex: "Relatório de Funil — Março 2026".',
        },
        conteudo: {
          type: 'string',
          description: 'Conteúdo completo do relatório em markdown. Pode incluir títulos, listas, tabelas e dados.',
        },
      },
      required: ['titulo', 'conteudo'],
    },
  },

  meta: {
    label: 'Publicar relatório',
    descricao: 'Salva um relatório gerado pela IA no painel de relatórios do CRM.',
    categoria: 'Relatórios',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const titulo   = input.titulo   as string
    const conteudo = input.conteudo as string

    if (!titulo?.trim() || !conteudo?.trim()) {
      return { sucesso: false, erro: 'Título e conteúdo são obrigatórios.', resumo: 'Relatório não salvo — título ou conteúdo vazio.' }
    }

    const relatorio = await prisma.relatorioAgente.create({
      data: {
        titulo,
        conteudo,
        tipo:          'manual',
        sucesso:       true,
        criadoPorId:   ctx.usuarioId   ?? null,
        criadoPorNome: ctx.usuarioNome ?? null,
      },
    })

    indexarAsync('relatorio', {
      id:           relatorio.id,
      titulo,
      conteudo,
      tipo:         'manual',
      sucesso:      true,
      criadoPorNome: ctx.usuarioNome ?? null,
      criadoEm:     relatorio.criadoEm,
    })

    return {
      sucesso: true,
      dados:   { relatorioId: relatorio.id, titulo },
      resumo:  `Relatório "${titulo}" publicado no painel de relatórios (ID: ${relatorio.id}).`,
    }
  },
}

registrarTool(publicarRelatorioTool)
