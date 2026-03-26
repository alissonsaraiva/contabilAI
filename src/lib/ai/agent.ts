import { prisma } from '@/lib/prisma'
import { getAiConfig } from './config'
import { getToolDefinitions, getTool } from './tools/registry'
import type { ToolContext, ToolExecuteResult } from './tools/types'
import type { AIMessageExtended, AnyContentPart } from './providers/types'
import { completeWithToolsFallback } from './providers/fallback'

// ─── Tipos públicos ────────────────────────────────────────────────────────────

/** Solicitantes reconhecidos — qualquer valor fora desta lista cai no escopo mais restritivo */
export type SolicitanteAI = 'crm' | 'whatsapp' | 'onboarding' | 'portal'

export type AgenteTask = {
  /** Instrução em linguagem natural para o agente executar */
  instrucao: string
  /** Contexto de cliente/lead e qual IA está solicitando */
  contexto: ToolContext
  /**
   * Whitelist de tools permitidas nesta execução.
   * undefined = usa o escopo padrão do solicitante (TOOLS_POR_FEATURE).
   */
  toolsPermitidas?: string[]
  /**
   * Limite de iterações do loop (proteção contra loops infinitos).
   * Default: 5
   */
  maxIteracoes?: number
}

export type AcaoExecutada = {
  tool: string
  input: Record<string, unknown>
  resultado: ToolExecuteResult
  duracaoMs: number
}

export type AgenteResultado = {
  /** Todas as ações executadas foram bem-sucedidas (ou nenhuma ação foi necessária) */
  sucesso: boolean
  /** Pelo menos uma ação foi bem-sucedida (mas pode ter tido falhas parciais) */
  sucessoParcial: boolean
  /** Resposta final em texto natural gerada pelo LLM após executar as tools */
  resposta: string
  /** Lista de todas as ações executadas nesta sessão */
  acoesExecutadas: AcaoExecutada[]
  iteracoes: number
}

// ─── Escopo de tools por IA solicitante ───────────────────────────────────────
//
// Cada IA tem um nível de acesso diferente ao agente operacional.
// undefined = sem restrição (acesso total às tools registradas).
//
// Onboarding: só pode buscar dados do próprio lead em processo de contratação
// WhatsApp:   leitura do próprio cliente/lead + criação de tarefa básica
// Portal:     cliente consultando seus próprios dados (somente leitura)
// CRM:        operador interno — acesso completo
//
const SOLICITANTES_VALIDOS: Set<string> = new Set(['crm', 'whatsapp', 'onboarding', 'portal'])

const TOOLS_POR_FEATURE: Record<string, string[] | undefined> = {
  onboarding: ['buscarDadosCliente'],
  whatsapp:   ['buscarDadosCliente', 'listarTarefas', 'criarTarefa'],
  portal:     ['buscarDadosCliente', 'listarTarefas'],
  crm:        undefined, // acesso total
}

// Timeout total do loop — deixa margem antes do limite de 60s das serverless functions
const AGENT_TIMEOUT_MS = 45_000

// ─── System prompt do agente operacional ──────────────────────────────────────

const AGENT_SYSTEM_PROMPT = `Você é o AgenteOperacional do CRM ContabAI.

Sua única responsabilidade é executar tarefas usando as ferramentas disponíveis.
Você NUNCA conversa diretamente com clientes ou leads — apenas com operadores internos ou outras IAs.

## Comportamento

1. Ao receber uma instrução, identifique quais ferramentas são necessárias
2. Execute as ferramentas na ordem lógica — use o resultado de uma para informar a próxima quando necessário
3. Após concluir, gere um resumo claro e direto do que foi feito ou encontrado
4. Se uma ferramenta falhar, tente alternativas quando possível; senão, informe claramente o que não foi possível executar

## Formato da resposta final

- Seja direto e objetivo — sem introduções desnecessárias
- Se executou ações de escrita (criar, atualizar), confirme o que foi feito
- Se consultou dados, apresente os dados de forma organizada
- Se nada foi encontrado, informe claramente
- Use marcadores "•" para listas

## Limites

- Não tome ações irreversíveis sem que a instrução seja explícita (ex: deletar, cancelar)
- Não invente dados — use apenas o que as ferramentas retornaram
- Não compartilhe dados de outros clientes que não o do contexto atual`

// ─── Função principal ──────────────────────────────────────────────────────────

export async function executarAgente(task: AgenteTask): Promise<AgenteResultado> {
  const { instrucao, toolsPermitidas, maxIteracoes = 5 } = task
  const acoesExecutadas: AcaoExecutada[] = []

  // 1. Valida solicitanteAI — valor inesperado cai no escopo mais restritivo (onboarding)
  const solicitanteSeguro = SOLICITANTES_VALIDOS.has(task.contexto.solicitanteAI)
    ? task.contexto.solicitanteAI
    : 'onboarding'
  const contexto: ToolContext = { ...task.contexto, solicitanteAI: solicitanteSeguro }

  // 2. Carrega config
  const config       = await getAiConfig()
  const providerName = config.providers.agente ?? config.provider
  const model        = config.models.agente ?? config.models.crm

  // 3. Monta tools disponíveis — aplica escopo por feature se toolsPermitidas não foi fornecido
  const escopoTools     = toolsPermitidas ?? TOOLS_POR_FEATURE[solicitanteSeguro]
  const toolDefinitions = getToolDefinitions(escopoTools)

  if (toolDefinitions.length === 0) {
    return {
      sucesso: false, sucessoParcial: false,
      resposta: 'Nenhuma ferramenta disponível para executar esta tarefa.',
      acoesExecutadas: [], iteracoes: 0,
    }
  }

  // 4. Constrói system prompt com contexto do cliente/lead
  const contextLines: string[] = []
  if (contexto.clienteId) contextLines.push(`clienteId: ${contexto.clienteId}`)
  if (contexto.leadId)    contextLines.push(`leadId: ${contexto.leadId}`)
  contextLines.push(`solicitante: ${solicitanteSeguro}`)

  const systemPrompt = `${AGENT_SYSTEM_PROMPT}\n\n## Contexto atual\n${contextLines.join('\n')}`

  // 5. Agentic loop
  const messages: AIMessageExtended[] = [{ role: 'user', content: instrucao }]

  let iteracoes    = 0
  let respostaFinal = ''
  const inicioTotal = Date.now()

  while (iteracoes < maxIteracoes) {
    // Timeout global — evita esgotar o limite de serverless functions (60s)
    if (Date.now() - inicioTotal > AGENT_TIMEOUT_MS) {
      respostaFinal = respostaFinal || `Tempo limite atingido após ${iteracoes} iterações. Ações executadas: ${acoesExecutadas.map(a => a.tool).join(', ') || 'nenhuma'}.`
      break
    }

    iteracoes++

    const response = await completeWithToolsFallback(
      {
        system:      systemPrompt,
        messages,
        tools:       toolDefinitions,
        maxTokens:   4096,
        temperature: 0.1,  // baixo — agente precisa ser determinístico
        model,
      },
      config,
      providerName,
    )

    // Monta conteúdo da resposta do assistente para o histórico
    const assistantContent: AnyContentPart[] = []
    if (response.text) {
      assistantContent.push({ type: 'text', text: response.text })
    }
    for (const tc of response.toolCalls) {
      assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
    }
    // Guard: alguns providers rejeitam content vazio — insere placeholder se necessário
    if (assistantContent.length === 0) {
      assistantContent.push({ type: 'text', text: '...' })
    }
    messages.push({ role: 'assistant', content: assistantContent })

    // Sem tool calls → LLM concluiu (end_turn ou max_tokens)
    if (response.stopReason !== 'tool_use' || response.toolCalls.length === 0) {
      // Garante que respostaFinal não é vazia — usa último texto disponível
      respostaFinal = response.text.trim() || respostaFinal || 'Tarefa concluída.'
      break
    }

    // Executa as tools — deduplica chamadas idênticas na mesma iteração
    const toolResultParts: AnyContentPart[] = []
    const vistoNessaIteracao = new Set<string>()

    for (const toolCall of response.toolCalls) {
      const chave = `${toolCall.name}:${JSON.stringify(toolCall.input)}`

      if (vistoNessaIteracao.has(chave)) {
        // Chamada duplicada na mesma iteração — devolve resultado sem re-executar
        toolResultParts.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: 'Ferramenta já executada com estes parâmetros nesta iteração.',
        })
        continue
      }
      vistoNessaIteracao.add(chave)

      const tool   = getTool(toolCall.name)
      const inicio = Date.now()
      let resultado: ToolExecuteResult

      if (!tool) {
        resultado = {
          sucesso: false,
          erro:    `Ferramenta "${toolCall.name}" não encontrada no registry.`,
          resumo:  `Erro: ferramenta ${toolCall.name} não está disponível.`,
        }
      } else {
        try {
          resultado = await tool.execute(toolCall.input, contexto)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          resultado = { sucesso: false, erro: msg, resumo: `Erro ao executar ${toolCall.name}: ${msg}` }
        }
      }

      const duracaoMs = Date.now() - inicio
      acoesExecutadas.push({ tool: toolCall.name, input: toolCall.input, resultado, duracaoMs })

      // Audit trail não-bloqueante — loga no console se falhar
      salvarAuditoria({
        clienteId:     contexto.clienteId,
        leadId:        contexto.leadId,
        solicitanteAI: solicitanteSeguro,
        tool:          toolCall.name,
        input:         toolCall.input,
        resultado,
        duracaoMs,
      }).catch(err => console.error('[agent] falha ao salvar auditoria:', err))

      toolResultParts.push({
        type:        'tool_result',
        tool_use_id: toolCall.id,
        content:     resultado.resumo,
      })
    }

    messages.push({ role: 'user', content: toolResultParts })
  }

  // Fallback final se loop esgotou sem resposta
  if (!respostaFinal) {
    respostaFinal = `Atingido limite de ${maxIteracoes} iterações. Ações executadas: ${acoesExecutadas.map(a => a.tool).join(', ') || 'nenhuma'}.`
  }

  const acoesOk      = acoesExecutadas.filter(a => a.resultado.sucesso).length
  const sucesso      = acoesExecutadas.length === 0 ? true : acoesOk === acoesExecutadas.length
  const sucessoParcial = acoesOk > 0

  return { sucesso, sucessoParcial, resposta: respostaFinal, acoesExecutadas, iteracoes }
}

// ─── Audit trail ──────────────────────────────────────────────────────────────

async function salvarAuditoria(params: {
  clienteId?: string
  leadId?: string
  solicitanteAI: string
  tool: string
  input: unknown
  resultado: ToolExecuteResult
  duracaoMs: number
}) {
  await prisma.agenteAcao.create({
    data: {
      clienteId:    params.clienteId,
      leadId:       params.leadId,
      solicitanteAI: params.solicitanteAI,
      tool:         params.tool,
      input:        params.input as object,
      resultado:    {
        sucesso:  params.resultado.sucesso,
        resumo:   params.resultado.resumo,
        erro:     params.resultado.erro ?? null,
        dados:    params.resultado.dados ?? null,
      } as object,
      sucesso:   params.resultado.sucesso,
      duracaoMs: params.duracaoMs,
    },
  })
}
