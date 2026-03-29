/**
 * Classificador de intenção — determina se uma mensagem é uma pergunta de conhecimento
 * (respondível pelo RAG) ou uma instrução de ação (requer dados reais do banco via agente).
 *
 * Usa sempre o modelo mais barato/rápido para minimizar latência.
 */
import { getAiConfig } from './config'
import { getProvider } from './providers'

export type Intencao = {
  tipo: 'pergunta' | 'acao'
  /** Instrução reformulada para o agente (só presente quando tipo === 'acao') */
  instrucao?: string
}

const SYSTEM_CLASSIFICADOR = `Você é um classificador de intenções para um sistema de gestão contábil.

Classifique a mensagem como:
- "pergunta": questão respondível por conhecimento (conceitos fiscais, regras, procedimentos, informações gerais do escritório)
- "acao": requer consultar dados reais do sistema ou executar uma tarefa (quantidades, listas, busca de registros específicos, criar/atualizar dados, métricas, dashboards)

Responda APENAS com JSON válido, sem markdown.

Exemplos:
- "o que é MEI?" → {"tipo":"pergunta"}
- "qual a alíquota do simples nacional?" → {"tipo":"pergunta"}
- "como funciona o onboarding?" → {"tipo":"pergunta"}
- "como estão as prospecções?" → {"tipo":"acao","instrucao":"Resumir funil de prospecção com quantidade de leads por etapa"}
- "quantos clientes em inadimplência?" → {"tipo":"acao","instrucao":"Contar e listar clientes com status inadimplente"}
- "cria uma tarefa pra ligar pro João amanhã" → {"tipo":"acao","instrucao":"Criar tarefa: ligar para o cliente João, prazo amanhã"}
- "quais tarefas vencem hoje?" → {"tipo":"acao","instrucao":"Listar tarefas com prazo vencendo hoje"}
- "tem algum lead parado há mais de 7 dias?" → {"tipo":"acao","instrucao":"Listar leads sem atividade há mais de 7 dias"}
- "mostra os dados do cliente" → {"tipo":"acao","instrucao":"Buscar dados completos do cliente atual"}
- "qual meu plano?" → {"tipo":"acao","instrucao":"Buscar dados do cliente incluindo plano e valor mensal"}
- "gera um relatório de clientes" → {"tipo":"acao","instrucao":"Consultar dados de clientes e publicar relatório estruturado no painel usando publicarRelatorio"}
- "relatório de inadimplentes" → {"tipo":"acao","instrucao":"Consultar clientes inadimplentes e publicar relatório no painel usando publicarRelatorio"}
- "me dá um resumo geral do escritório" → {"tipo":"acao","instrucao":"Consultar métricas gerais e publicar relatório resumo no painel usando publicarRelatorio"}
- "quero um relatório de funil" → {"tipo":"acao","instrucao":"Consultar funil de prospecção e publicar relatório no painel usando publicarRelatorio"}`

// ─── Fallback por keywords (quando nenhum provider disponível) ────────────────

const ACAO_KEYWORDS = [
  /\b(quantos?|quantas?)\b/i,
  /\b(lista[rm]?|mostre?|exib[ae]|ver?|veja)\b/i,
  /\b(prospec[çc][õo]es?|funil|pipeline|leads?)\b/i,
  /\b(tarefas?|atividades?|pendentes?|venc[eo])\b/i,
  /\b(clientes?|inadimpl|ativos?|cancelados?)\b/i,
  /\b(cria[r]?|agendar?|adicionar?)\b.*\b(tarefa|atividade|lembrete)\b/i,
  /\b(resumo|panorama|vis[ãa]o geral|como est[ãa]o)\b/i,
  /\b(dados|informa[çc][õo]es?).*(cliente|lead|contrato)\b/i,
  /\b(relat[oó]rio|relat[oó]rios?)\b/i,
  /\b(gera[r]?|cria[r]?|monta[r]?|publica[r]?)\b.*\b(relat[oó]rio|resumo|an[aá]lise)\b/i,
]

function classificarPorKeyword(mensagem: string): Intencao {
  const ehRelatorio = /\b(relat[oó]rio|gera[r]?.*resumo|monta[r]?.*relat|cria[r]?.*relat)\b/i.test(mensagem)
  for (const re of ACAO_KEYWORDS) {
    if (re.test(mensagem)) {
      const instrucao = ehRelatorio
        ? `${mensagem} — consultar dados necessários e publicar relatório estruturado no painel usando publicarRelatorio`
        : mensagem
      return { tipo: 'acao', instrucao }
    }
  }
  return { tipo: 'pergunta' }
}

// ─── Classificador principal ──────────────────────────────────────────────────

export async function classificarIntencao(
  mensagem: string,
  contexto?: string,
): Promise<Intencao> {
  try {
    const config = await getAiConfig()

    // Sem Anthropic → tenta fallback por keywords
    if (!config.anthropicApiKey) return classificarPorKeyword(mensagem)

    const provider = getProvider('claude')
    const prompt = contexto
      ? `Contexto: ${contexto}\n\nMensagem: "${mensagem}"`
      : `Mensagem: "${mensagem}"`

    const result = await provider.complete({
      system: SYSTEM_CLASSIFICADOR,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 80,
      temperature: 0,
      model: 'claude-haiku-4-5-20251001',  // sempre haiku — só precisa de velocidade
      apiKey: config.anthropicApiKey,
    })

    const parsed = JSON.parse(result.text.trim()) as Intencao
    if (parsed.tipo !== 'pergunta' && parsed.tipo !== 'acao') return { tipo: 'pergunta' }
    return parsed
  } catch {
    // Parse/rede falhou → tenta keywords antes de desistir
    return classificarPorKeyword(mensagem)
  }
}
