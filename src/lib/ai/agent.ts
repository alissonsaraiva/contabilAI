import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { registrarAgenteExecutou } from '@/lib/historico'
import { getAiConfig } from './config'
import { getToolDefinitions, getTools, getTool } from './tools/registry'
import type { ToolContext, ToolExecuteResult } from './tools/types'
import type { AIMessageExtended, AnyContentPart } from './providers/types'
import { completeWithToolsFallback } from './providers/fallback'
import { indexarAsync } from '@/lib/rag/indexar-async'

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
// O acesso de cada canal é declarado diretamente no campo `canais` do meta de
// cada tool — não há mais whitelist manual aqui.
// Para restringir ou ampliar o acesso de um canal a uma tool específica, edite
// o campo `canais` na própria tool ou use `toolsCanaisOverride` no banco.
//
const SOLICITANTES_VALIDOS: Set<string> = new Set(['crm', 'whatsapp', 'onboarding', 'portal'])

// Timeout total do loop — deixa margem antes do limite de 60s das serverless functions
const AGENT_TIMEOUT_MS = 45_000
// Timeout por execução de tool individual
const TOOL_TIMEOUT_MS = 10_000

// ─── System prompt do agente operacional ──────────────────────────────────────

const AGENT_SYSTEM_PROMPT = `Você é o AgenteOperacional do CRM {nomeEscritorio}.

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
- NUNCA use notações entre colchetes — proibido: [Documento enviado: arquivo.pdf], [Documento recebido: arquivo.pdf], [Documento: ...], [Arquivo: ...]. Mencione o nome do arquivo diretamente em texto simples, sem colchetes de nenhum tipo

## Relatórios

Quando o operador pedir para "gerar", "criar" ou "montar" um relatório, análise ou resumo:
1. Use consultarDados ou outras tools de leitura para obter os dados necessários
2. OBRIGATORIAMENTE chame publicarRelatorio com os dados estruturados — isso salva o relatório no painel
3. Não retorne apenas o texto — o relatório deve ser publicado para o operador acessar, exportar em PDF/XLS e compartilhar

## Resolução de entidades

Antes de pedir identificadores ao operador (ID, CPF, CNPJ), use as ferramentas de busca
disponíveis para localizar a entidade pelo nome ou dado parcial informado.
Pergunte ao operador somente se: (a) a busca retornar múltiplos resultados ambíguos,
ou (b) nenhuma ferramenta de busca estiver disponível para aquela entidade.

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
  const [config, escritorioRow] = await Promise.all([
    getAiConfig(),
    prisma.escritorio.findFirst({ select: { nome: true } }),
  ])
  const nomeEscritorio = escritorioRow?.nome ?? process.env.NEXT_PUBLIC_APP_NAME ?? 'Avos'
  const providerName = config.providers.agente ?? config.provider
  const model        = config.models.agente ?? config.models.crm

  // 3. Monta tools disponíveis — fonte de verdade é o campo `canais` de cada tool.
  //    Respeita: canaisOverride do admin > canais do meta > toolsDesabilitadas.
  //    toolsPermitidas (whitelist explícita) restringe ainda mais quando fornecida.
  const desabilitadas    = new Set(config.toolsDesabilitadas)
  const canaisOverride   = config.toolsCanaisOverride

  const nomesAtivos = getTools()
    .filter(t => {
      // Override configurado pelo admin tem precedência sobre o meta da tool
      const override = canaisOverride[t.definition.name]
      if (override) return (override as string[]).includes(solicitanteSeguro)
      // Sem override: usa os canais declarados no meta da tool
      return (t.meta.canais as string[]).includes(solicitanteSeguro)
    })
    .filter(t => !desabilitadas.has(t.definition.name))
    .filter(t => !toolsPermitidas || toolsPermitidas.includes(t.definition.name))
    .map(t => t.definition.name)

  const toolDefinitions = getToolDefinitions(nomesAtivos)

  if (toolDefinitions.length === 0) {
    return {
      sucesso: false, sucessoParcial: false,
      resposta: 'Nenhuma ferramenta disponível para executar esta tarefa.',
      acoesExecutadas: [], iteracoes: 0,
    }
  }

  // 4. Constrói system prompt com contexto do cliente/lead e do usuário
  const contextLines: string[] = []
  if (contexto.usuarioId)   contextLines.push(`usuarioId: ${contexto.usuarioId}`)
  if (contexto.usuarioNome) contextLines.push(`usuarioNome: ${contexto.usuarioNome}`)
  if (contexto.usuarioTipo) contextLines.push(`usuarioTipo: ${contexto.usuarioTipo}`)
  if (contexto.clienteId)   contextLines.push(`clienteId: ${contexto.clienteId}`)
  if (contexto.leadId)      contextLines.push(`leadId: ${contexto.leadId}`)
  contextLines.push(`solicitante: ${solicitanteSeguro}`)

  // Linha de identificação do operador para personalizar a resposta
  const operadorInfo = contexto.usuarioNome
    ? `\n\nO operador que está solicitando esta ação é ${contexto.usuarioNome}${contexto.usuarioTipo ? ` (${contexto.usuarioTipo})` : ''}. Quando confirmar ações concluídas, você pode endereçar a resposta a ele pelo nome.`
    : ''

  const systemPrompt = `${AGENT_SYSTEM_PROMPT.replace('{nomeEscritorio}', nomeEscritorio)}${operadorInfo}\n\n## Contexto atual\n${contextLines.join('\n')}`

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
        maxTokens:   2048,  // tool calls precisam ~300t; resposta final ~1000t — 4096 era desperdício
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
          resultado = await Promise.race([
            tool.execute(toolCall.input, contexto),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Tool timeout após 10s')), TOOL_TIMEOUT_MS)
            ),
          ])
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
        usuarioId:     contexto.usuarioId,
        usuarioNome:   contexto.usuarioNome,
        usuarioTipo:   contexto.usuarioTipo,
        tool:          toolCall.name,
        input:         toolCall.input,
        resultado,
        duracaoMs,
      })
        .then(acao => {
          // Feedback loop: indexa ações bem-sucedidas no RAG para que a IA possa
          // responder "o que foi feito para o cliente X?" sem precisar de tool call.
          // Apenas ações com contexto de cliente/lead e resumo substantivo são indexadas.
          if (resultado.sucesso && acao?.id && (contexto.clienteId || contexto.leadId)) {
            indexarAsync('agenteAcao', {
              id:            acao.id,
              clienteId:     contexto.clienteId,
              leadId:        contexto.leadId,
              tool:          toolCall.name,
              solicitanteAI: solicitanteSeguro,
              usuarioNome:   contexto.usuarioNome,
              input:         toolCall.input,
              resultado,
              sucesso:       resultado.sucesso,
              duracaoMs,
              criadoEm:      new Date(),
            })
          }
        })
        .catch(err => {
          console.error('[agent] falha ao salvar auditoria:', err)
          Sentry.captureException(err, { tags: { module: 'agent', operation: 'auditoria' }, extra: { tool: toolCall.name } })
        })

      // Histórico central — fire-and-forget
      registrarAgenteExecutou({
        tool:      toolCall.name,
        resumo:    resultado.resumo,
        sucesso:   resultado.sucesso,
        clienteId: contexto.clienteId,
        leadId:    contexto.leadId,
        duracaoMs,
      })

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
  usuarioId?: string
  usuarioNome?: string
  usuarioTipo?: string
  tool: string
  input: unknown
  resultado: ToolExecuteResult
  duracaoMs: number
}) {
  return prisma.agenteAcao.create({
    data: {
      clienteId:     params.clienteId,
      leadId:        params.leadId,
      solicitanteAI: params.solicitanteAI,
      usuarioId:     params.usuarioId,
      usuarioNome:   params.usuarioNome,
      usuarioTipo:   params.usuarioTipo,
      tool:          params.tool,
      input:         params.input as object,
      resultado: {
        sucesso: params.resultado.sucesso,
        resumo:  params.resultado.resumo,
        erro:    params.resultado.erro ?? null,
        dados:   params.resultado.dados ?? null,
      } as object,
      sucesso:   params.resultado.sucesso,
      duracaoMs: params.duracaoMs,
    } as never,
  })
}
