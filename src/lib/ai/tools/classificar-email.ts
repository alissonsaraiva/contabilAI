import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

// Heurísticas de classificação — evita chamada extra de IA para casos óbvios
const PALAVRAS_URGENTES = [
  'urgente', 'imediato', 'prazo', 'vencimento', 'multa', 'autuação', 'fiscalização',
  'intimação', 'notificação fiscal', 'bloqueio', 'cancelamento', 'rescisão',
]
const PALAVRAS_RECLAMACAO = [
  'reclamação', 'insatisfeito', 'errado', 'problema', 'absurdo', 'cobrado indevidamente',
  'não recebi', 'não foi feito', 'decepcionado', 'péssimo', 'horrível',
]
const PALAVRAS_SOLICITACAO = [
  'preciso', 'solicito', 'poderia', 'gostaria', 'pode me enviar', 'me manda',
  'quero', 'necessito', 'favor enviar', 'aguardo', 'me passa',
]
const PALAVRAS_DUVIDA = [
  'dúvida', 'pergunta', 'como funciona', 'o que é', 'qual é', 'quando',
  'onde', 'por que', 'me explica', 'quero entender', 'não entendi',
]

function classificarPorHeuristica(assunto: string, corpo: string): {
  urgencia: 'alta' | 'media' | 'baixa'
  tipo: 'solicitacao' | 'duvida' | 'reclamacao' | 'informativo'
} | null {
  const texto = `${assunto} ${corpo}`.toLowerCase()

  const ehUrgente   = PALAVRAS_URGENTES.some(p => texto.includes(p))
  const ehReclam    = PALAVRAS_RECLAMACAO.some(p => texto.includes(p))
  const ehSolicita  = PALAVRAS_SOLICITACAO.some(p => texto.includes(p))
  const ehDuvida    = PALAVRAS_DUVIDA.some(p => texto.includes(p))

  if (!ehUrgente && !ehReclam && !ehSolicita && !ehDuvida) return null  // inconclusivo

  const tipo: 'solicitacao' | 'duvida' | 'reclamacao' | 'informativo' =
    ehReclam   ? 'reclamacao'  :
    ehSolicita ? 'solicitacao' :
    ehDuvida   ? 'duvida'      : 'informativo'

  const urgencia: 'alta' | 'media' | 'baixa' =
    ehUrgente  ? 'alta'  :
    ehReclam   ? 'media' : 'baixa'

  return { urgencia, tipo }
}

const classificarEmailTool: Tool = {
  definition: {
    name: 'classificarEmail',
    description: `Classifica um email recebido por urgência e tipo, e atualiza os metadados da interação.

Use quando o operador pedir para:
- "Classifica esse email pra mim"
- "É urgente esse email?"
- "Qual o tipo desse email?"
- "Prioriza os emails da caixa de entrada"

A classificação ajuda a priorizar o atendimento — emails com urgência alta são destacados na caixa de entrada.

Retorna:
- urgencia: "alta" | "media" | "baixa"
- tipo: "solicitacao" | "duvida" | "reclamacao" | "informativo"
- acaoSugerida: texto explicando o que o contador deve fazer`,
    inputSchema: {
      type: 'object',
      properties: {
        interacaoId: {
          type: 'string',
          description: 'ID da Interacao do tipo email_recebido a ser classificada.',
        },
      },
      required: ['interacaoId'],
    },
  },

  meta: {
    label: 'Classificar email',
    descricao: 'Classifica um email recebido por urgência e tipo para priorização.',
    categoria: 'Email',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const interacaoId = input.interacaoId as string
    if (!interacaoId?.trim()) {
      return { sucesso: false, erro: 'interacaoId é obrigatório.', resumo: 'Classificação não realizada — ID ausente.' }
    }

    const interacao = await prisma.interacao.findUnique({
      where: { id: interacaoId },
      select: {
        id:        true,
        tipo:      true,
        titulo:    true,
        conteudo:  true,
        metadados: true,
        clienteId: true,
        leadId:    true,
      },
    })

    if (!interacao) {
      return { sucesso: false, erro: 'Interação não encontrada.', resumo: 'Email não encontrado.' }
    }
    if (interacao.tipo !== 'email_recebido') {
      return { sucesso: false, erro: 'Interação não é do tipo email_recebido.', resumo: 'Só é possível classificar emails recebidos.' }
    }

    const metadados   = (interacao.metadados ?? {}) as Record<string, unknown>
    const assunto     = String(metadados.assunto ?? interacao.titulo ?? '')
    const corpo       = String(interacao.conteudo ?? '')

    // Tenta heurística primeiro — se inconclusivo, usa IA
    let classificacao = classificarPorHeuristica(assunto, corpo)

    if (!classificacao) {
      // Classificação via IA para casos ambíguos
      try {
        const { askAI } = await import('@/lib/ai/ask')
        const context = interacao.clienteId
          ? { escopo: 'cliente+global' as const, clienteId: interacao.clienteId }
          : interacao.leadId
            ? { escopo: 'lead+global' as const, leadId: interacao.leadId }
            : { escopo: 'global' as const }

        const { resposta } = await askAI({
          pergunta: `Classifique este email em JSON com os campos: urgencia (alta/media/baixa), tipo (solicitacao/duvida/reclamacao/informativo), acaoSugerida (string).\n\nAssunto: ${assunto}\n\nCorpo: ${corpo.slice(0, 800)}`,
          context,
          feature: 'crm',
          systemExtra: 'Você é um classificador de emails. Retorne SOMENTE um objeto JSON válido, sem markdown, sem explicações.',
          maxTokens: 200,
        })

        const parsed = JSON.parse(resposta.replace(/```json|```/g, '').trim())
        if (parsed.urgencia && parsed.tipo) {
          classificacao = { urgencia: parsed.urgencia, tipo: parsed.tipo }
        }
      } catch (err) {
        console.error('[tool/classificar-email] falha na classificação IA:', err)
        // Fallback para classificação padrão
        classificacao = { urgencia: 'baixa', tipo: 'informativo' }
      }
    }

    const { urgencia, tipo } = classificacao!

    // Mapa de ações sugeridas por tipo × urgência
    const acoesSugeridas: Record<string, string> = {
      'reclamacao-alta':    'Responder imediatamente e escalar para o contador responsável.',
      'reclamacao-media':   'Responder no mesmo dia com apuração do caso.',
      'reclamacao-baixa':   'Responder em até 24h com explicação clara.',
      'solicitacao-alta':   'Atender com prioridade — pode haver prazo fiscal envolvido.',
      'solicitacao-media':  'Incluir na fila de atendimento do dia.',
      'solicitacao-baixa':  'Atender em até 48h.',
      'duvida-alta':        'Responder hoje — pode impactar decisão urgente do cliente.',
      'duvida-media':       'Responder em até 24h com orientação clara.',
      'duvida-baixa':       'Responder em até 48h ou usar a sugestão da IA.',
      'informativo-alta':   'Verificar se requer ação imediata.',
      'informativo-media':  'Arquivar após leitura.',
      'informativo-baixa':  'Arquivar após leitura.',
    }
    const acaoSugerida = acoesSugeridas[`${tipo}-${urgencia}`] ?? 'Avaliar e responder conforme necessidade.'

    // Persiste a classificação nos metadados da interação
    const novoMetadados = {
      ...metadados,
      classificacao: { urgencia, tipo, acaoSugerida, classificadoEm: new Date().toISOString() },
    }

    const interacaoAtualizada = await prisma.interacao.update({
      where: { id: interacaoId },
      data:  { metadados: novoMetadados },
      select: { id: true, clienteId: true, leadId: true, titulo: true, conteudo: true, criadoEm: true },
    })

    // Indexa o email classificado no RAG (fire-and-forget)
    import('@/lib/rag/ingest').then(({ indexarEmailClassificado }) =>
      indexarEmailClassificado({
        id:        interacaoAtualizada.id,
        clienteId: interacaoAtualizada.clienteId,
        leadId:    interacaoAtualizada.leadId,
        titulo:    interacaoAtualizada.titulo,
        conteudo:  interacaoAtualizada.conteudo,
        criadoEm:  interacaoAtualizada.criadoEm,
        metadados: novoMetadados,
      })
    ).catch(err => {
      console.error('[tool/classificarEmail] erro ao indexar RAG:', err)
      Sentry.captureException(err, { tags: { module: 'tool', operation: 'classificarEmail-rag' } })
    })

    return {
      sucesso: true,
      dados:   { interacaoId, urgencia, tipo, acaoSugerida },
      resumo:  `Email classificado: urgência ${urgencia}, tipo ${tipo}. Ação sugerida: ${acaoSugerida}`,
    }
  },
}

registrarTool(classificarEmailTool)
