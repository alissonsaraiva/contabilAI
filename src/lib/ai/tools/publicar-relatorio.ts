import { prisma } from '@/lib/prisma'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const EXEMPLO_JSON = JSON.stringify({
  version: 1,
  kpis: [
    { label: "Total de clientes", valor: 6 },
    { label: "Inadimplentes", valor: 1, destaque: "danger" }
  ],
  secoes: [
    {
      tipo: "tabela",
      titulo: "Detalhamento por Cliente",
      colunas: ["Cliente", "Plano", "Status", "Valor Mensal"],
      linhas: [
        ["Sandra Oliveira", "Essencial", "Suspenso", "R$ 179,00"],
        ["Fernanda Lima", "Essencial", "Ativo", "R$ 249,00"]
      ]
    },
    {
      tipo: "texto",
      titulo: "Observações",
      conteudo: "1 cliente com status suspenso. Recomenda-se contato para regularização."
    }
  ]
}, null, 2)

const publicarRelatorioTool: Tool = {
  definition: {
    name: 'publicarRelatorio',
    description: `Publica um relatório estruturado no painel de relatórios do CRM para que o operador possa consultar, exportar em PDF ou XLS depois. Use quando o operador pedir para gerar um relatório, resumo ou análise que deve ficar salvo.

O campo "conteudo" DEVE ser um JSON válido com a seguinte estrutura:
- version: sempre 1
- kpis (opcional): array de métricas resumidas — cada item tem "label" (string), "valor" (string ou número) e opcionalmente "destaque" ("ok" | "warning" | "danger")
- secoes: array de seções — cada seção pode ser:
  - tipo "tabela": { tipo: "tabela", titulo: string, colunas: string[], linhas: string[][] }
  - tipo "texto": { tipo: "texto", titulo?: string, conteudo: string }
  - tipo "lista": { tipo: "lista", titulo?: string, itens: string[] }

Exemplo de conteudo válido:
${EXEMPLO_JSON}

IMPORTANTE: o campo "conteudo" deve ser uma string JSON serializada, não um objeto.`,
    inputSchema: {
      type: 'object',
      properties: {
        titulo: {
          type: 'string',
          description: 'Título descritivo do relatório. Ex: "Relatório de Clientes por Plano — Março 2026".',
        },
        conteudo: {
          type: 'string',
          description: 'JSON serializado com a estrutura do relatório (version, kpis, secoes). Deve ser um JSON válido conforme especificado na description da tool.',
        },
      },
      required: ['titulo', 'conteudo'],
    },
  },

  meta: {
    label: 'Publicar relatório',
    descricao: 'Salva um relatório estruturado (JSON) no painel de relatórios do CRM.',
    categoria: 'Relatórios',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const titulo   = input.titulo   as string
    const conteudo = input.conteudo as string

    if (!titulo?.trim() || !conteudo?.trim()) {
      return { sucesso: false, erro: 'Título e conteúdo são obrigatórios.', resumo: 'Relatório não salvo — título ou conteúdo vazio.' }
    }

    // Valida se o JSON é estruturado corretamente
    try {
      const parsed = JSON.parse(conteudo)
      if (parsed?.version !== 1 || !Array.isArray(parsed?.secoes)) {
        return { sucesso: false, erro: 'Conteúdo não é um RelatorioJSON válido (version=1, secoes=[]).', resumo: 'Relatório não salvo — JSON inválido.' }
      }
    } catch {
      return { sucesso: false, erro: 'Conteúdo não é um JSON válido.', resumo: 'Relatório não salvo — JSON inválido.' }
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
      id:            relatorio.id,
      titulo,
      conteudo,
      tipo:          'manual',
      sucesso:       true,
      criadoPorNome: ctx.usuarioNome ?? null,
      criadoEm:      relatorio.criadoEm,
    })

    return {
      sucesso: true,
      dados:   { relatorioId: relatorio.id, titulo },
      resumo:  `Relatório "${titulo}" publicado no painel de relatórios. O operador pode exportar em PDF ou XLS pelo painel.`,
    }
  },
}

registrarTool(publicarRelatorioTool)
