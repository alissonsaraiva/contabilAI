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
- "quero um relatório de funil" → {"tipo":"acao","instrucao":"Consultar funil de prospecção e publicar relatório no painel usando publicarRelatorio"}

IMPORTANTE: Quando o contexto indica que a assistente se ofereceu para fazer algo (verificar documentos, consultar dados, buscar informações), e o usuário confirma com frases curtas como "pode", "sim", "pode verificar", "ok", "vai lá", "pode fazer isso", classifique como "acao" repetindo a instrução da mensagem anterior da assistente.
Exemplos com contexto:
- Contexto: assistente disse "posso verificar seus documentos" → usuário: "pode" → {"tipo":"acao","instrucao":"Buscar documentos disponíveis do cliente"}
- Contexto: assistente disse "posso verificar declaração de 2024" → usuário: "pode verificar" → {"tipo":"acao","instrucao":"Buscar documentos do cliente filtrado por categoria imposto_renda"}
- Contexto: assistente disse "posso abrir um chamado" → usuário: "sim" → {"tipo":"acao","instrucao":"Criar ordem de serviço para o cliente"}`

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
  /\b(documentos?|doc)\b/i,
  /\b(boleto|nota\s*fiscal|contrato|comprovante)\b/i,
  /\b(plano|mensalidade|vencimento|valor)\b/i,
  /\b(status|situa[çc][ãa]o|como\s*est[áa])\b/i,
]

// Confirmações que indicam que o usuário está autorizando uma ação prometida pela IA
const CONFIRMACAO_KEYWORDS = /^(pode|sim|pode\s+sim|pode\s+verificar|pode\s+fazer|pode\s+ir|ok|tá\s+bom|ta\s+bom|vai\s+lá|vai\s+la|claro|certo|ótimo|pode\s+ser|com\s+certeza|s[íi]|confirmo|confirma|por\s+favor|pf|plz|yes|go)[\s!.]*$/i

function classificarPorKeyword(mensagem: string, ultimaMsgIA?: string): Intencao {
  const ehRelatorio = /\b(relat[oó]rio|gera[r]?.*resumo|monta[r]?.*relat|cria[r]?.*relat)\b/i.test(mensagem)

  // Se mensagem é uma confirmação curta E a IA havia prometido buscar dados → ação
  if (CONFIRMACAO_KEYWORDS.test(mensagem.trim()) && ultimaMsgIA) {
    const iapromessaBusca = /\b(verificar|consultar|buscar|checar|ver|procurar|listar|mostrar)\b/i.test(ultimaMsgIA)
    if (iapromessaBusca) {
      return {
        tipo: 'acao',
        instrucao: `O usuário confirmou que deseja prosseguir. Baseado na última resposta da IA: "${ultimaMsgIA.slice(0, 200)}" — executar a verificação/consulta prometida.`,
      }
    }
  }

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
  ultimaMsgIA?: string,
): Promise<Intencao> {
  try {
    const config = await getAiConfig()

    // Sem Anthropic → tenta fallback por keywords (com contexto da última msg da IA)
    if (!config.anthropicApiKey) return classificarPorKeyword(mensagem, ultimaMsgIA)

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
    return classificarPorKeyword(mensagem, ultimaMsgIA)
  }
}
