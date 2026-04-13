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
- "acao": requer consultar dados reais do sistema ou executar uma tarefa (quantidades, listas, busca de registros específicos, criar/atualizar dados, métricas, dashboards, envio de arquivos, situação financeira do cliente)

Responda APENAS com JSON válido, sem markdown.

## Regra principal para envio de documentos via WhatsApp

Quando o cliente pede para receber/enviar um documento (holerite, nota fiscal, boleto, contrato, guia, comprovante etc.), a instrucao DEVE incluir "enviar via WhatsApp usando enviarDocumentoWhatsApp". O agente buscará o documento e enviará na mesma execução — sem pedir confirmação.

Exemplos diretos de envio:
- "me manda o holerite" → {"tipo":"acao","instrucao":"Buscar holerite mais recente do cliente e enviar via WhatsApp usando enviarDocumentoWhatsApp"}
- "pode me enviar o último holerite?" → {"tipo":"acao","instrucao":"Buscar holerite mais recente do cliente e enviar via WhatsApp usando enviarDocumentoWhatsApp"}
- "quero minha nota fiscal" → {"tipo":"acao","instrucao":"Buscar nota fiscal mais recente do cliente e enviar via WhatsApp usando enviarDocumentoWhatsApp"}
- "me envia o boleto" → {"tipo":"acao","instrucao":"Buscar boleto em aberto do cliente e enviar via WhatsApp usando enviarDocumentoWhatsApp"}
- "cadê meu contrato?" → {"tipo":"acao","instrucao":"Buscar contrato do cliente e enviar via WhatsApp usando enviarDocumentoWhatsApp"}
- "me manda a guia do DARF" → {"tipo":"acao","instrucao":"Buscar guia DARF do cliente e enviar via WhatsApp usando enviarDocumentoWhatsApp"}
- "reenviar holerite de janeiro" → {"tipo":"acao","instrucao":"Buscar holerite de janeiro do cliente e enviar via WhatsApp usando enviarDocumentoWhatsApp"}

## Regras para consultas financeiras (SEMPRE classificar como ação)

Qualquer pergunta sobre situação financeira real do cliente REQUER consulta ao sistema — não ao RAG:
- "meu boleto venceu?" → {"tipo":"acao","instrucao":"Buscar cobranças em aberto ou vencidas do cliente usando listarCobrancasCliente"}
- "estou em dia?" / "estou inadimplente?" → {"tipo":"acao","instrucao":"Buscar cobranças em aberto ou vencidas do cliente usando listarCobrancasCliente"}
- "quando vence minha próxima fatura?" → {"tipo":"acao","instrucao":"Buscar cobranças do cliente e mostrar próxima a vencer usando listarCobrancasCliente"}
- "qual o valor da minha mensalidade?" → {"tipo":"acao","instrucao":"Buscar dados do cliente incluindo plano e valor mensal"}
- "quantas notas emiti esse ano?" / "quantas notas emiti?" → {"tipo":"acao","instrucao":"Consultar notas fiscais do cliente no período usando consultarNotasFiscais"}
- "quero ver minhas faturas" / "histórico de pagamentos" → {"tipo":"acao","instrucao":"Buscar extrato financeiro do cliente usando extratoFinanceiro"}
- "preciso de segunda via" / "meu pix expirou" / "boleto não chegou" → {"tipo":"acao","instrucao":"Gerar segunda via da cobrança em aberto do cliente usando gerarSegundaViaAsaas"}
- "quero mudar meu vencimento" → {"tipo":"acao","instrucao":"Alterar data de vencimento da cobrança do cliente usando alterarVencimentoCobranca"}
- "quero pagar por pix" / "mudar para boleto" → {"tipo":"acao","instrucao":"Alterar forma de pagamento do cliente usando alterarFormaPagamento"}

Outros exemplos de ações:
- "o que é MEI?" → {"tipo":"pergunta"}
- "qual a alíquota do simples nacional?" → {"tipo":"pergunta"}
- "como funciona o onboarding?" → {"tipo":"pergunta"}
- "como estão as prospecções?" → {"tipo":"acao","instrucao":"Resumir funil de prospecção com quantidade de leads por etapa"}
- "quantos clientes em inadimplência?" → {"tipo":"acao","instrucao":"Contar e listar clientes com status inadimplente"}
- "tem algum lead parado há mais de 7 dias?" → {"tipo":"acao","instrucao":"Listar leads sem atividade há mais de 7 dias"}
- "mostra os dados do cliente" → {"tipo":"acao","instrucao":"Buscar dados completos do cliente atual"}
- "qual meu plano?" → {"tipo":"acao","instrucao":"Buscar dados do cliente incluindo plano e valor mensal"}
- "gera um relatório de clientes" → {"tipo":"acao","instrucao":"Consultar dados de clientes e publicar relatório estruturado no painel usando publicarRelatorio"}
- "relatório de inadimplentes" → {"tipo":"acao","instrucao":"Consultar clientes inadimplentes e publicar relatório no painel usando publicarRelatorio"}
- "me dá um resumo geral do escritório" → {"tipo":"acao","instrucao":"Consultar métricas gerais e publicar relatório resumo no painel usando publicarRelatorio"}
- "quero um relatório de funil" → {"tipo":"acao","instrucao":"Consultar funil de prospecção e publicar relatório no painel usando publicarRelatorio"}

## Respostas positivas a uma ação prometida pela IA

Quando o contexto mostra que a IA prometeu fazer algo, e o usuário responde de forma positiva (qualquer frase curta afirmativa, sem negação), classifique como "acao" reaproveitando a intenção original.
A resposta positiva pode ser qualquer coisa: "pode", "sim", "manda", "ok", "vai", "manda sim", "por favor", "pode mandar", "quero", "tá bom", etc.

Exemplos com contexto:
- Contexto: assistente disse "posso reenviar o holerite de Janeiro/2026" → usuário: "pode mandar" → {"tipo":"acao","instrucao":"Buscar holerite de Janeiro/2026 do cliente e enviar via WhatsApp usando enviarDocumentoWhatsApp"}
- Contexto: assistente disse "posso verificar seus documentos" → usuário: "pode" → {"tipo":"acao","instrucao":"Buscar documentos disponíveis do cliente"}
- Contexto: assistente disse "posso verificar declaração de 2024" → usuário: "pode verificar" → {"tipo":"acao","instrucao":"Buscar documentos do cliente filtrado por categoria imposto_renda"}
- Contexto: assistente disse "posso abrir um chamado" → usuário: "sim" → {"tipo":"acao","instrucao":"Criar chamado para o cliente"}
- Contexto: assistente disse "posso enviar a nota fiscal" → usuário: "manda logo" → {"tipo":"acao","instrucao":"Buscar nota fiscal do cliente e enviar via WhatsApp usando enviarDocumentoWhatsApp"}
- Contexto: assistente disse "posso reenviar o boleto" → usuário: "vai lá" → {"tipo":"acao","instrucao":"Buscar boleto do cliente e enviar via WhatsApp usando enviarDocumentoWhatsApp"}`

// ─── Fallback por keywords (quando nenhum provider disponível) ────────────────

const ACAO_KEYWORDS = [
  /\b(quantos?|quantas?)\b/i,
  /\b(lista[rm]?|mostre?|exib[ae]|ver?|veja)\b/i,
  /\b(prospec[çc][õo]es?|funil|pipeline|leads?)\b/i,
  /\b(clientes?|inadimpl|ativos?|cancelados?)\b/i,
  /\b(resumo|panorama|vis[ãa]o geral|como est[ãa]o)\b/i,
  /\b(dados|informa[çc][õo]es?).*(cliente|lead|contrato)\b/i,
  /\b(relat[oó]rio|relat[oó]rios?)\b/i,
  /\b(gera[r]?|cria[r]?|monta[r]?|publica[r]?)\b.*\b(relat[oó]rio|resumo|an[aá]lise)\b/i,
  /\b(documentos?|doc)\b/i,
  /\b(boleto|nota\s*fiscal|contrato|comprovante|holerite|guia|darf)\b/i,
  /\b(plano|mensalidade|vencimento|valor)\b/i,
  /\b(status|situa[çc][ãa]o|como\s*est[áa])\b/i,
  /\b(manda[r]?|envia[r]?|reenv[ia]+[r]?|encaminha[r]?)\b/i,
  // Consultas financeiras — requerem dados reais do sistema, não RAG
  /\b(venceu?|venci[da]?|atrasad[ao]?|em\s*dia|inadimpl)\b/i,
  /\b(fatura[s]?|cobran[çc][a]?|pagamento[s]?|pix|segunda\s*via)\b/i,
  /\b(extrato|hist[oó]rico.*pag|paguei|recebi)\b/i,
  /\b(mudar?.*vencimento|trocar?.*vencimento|mudar?.*pagamento|trocar?.*pagamento)\b/i,
]

// Keywords que indicam pedido direto de envio de documento
const ENVIO_KEYWORDS = /\b(holerite|contr[ac]cheque|nota\s*fiscal|boleto|contrato|comprovante|guia|darf|imposto|declaração|declaracao|extrato)\b/i

// Keywords que indicam consulta financeira (situação de cobrança/pagamento)
const FINANCEIRO_KEYWORDS = /\b(venceu?|atrasad[ao]?|em\s*dia|inadimpl|fatura|cobran[çc][a]|segunda\s*via|pix\s*expir|boleto\s*n[aã]o|paguei|extrato|hist[oó]rico.*pag)\b/i

/**
 * Avalia se a mensagem é uma resposta positiva a uma promessa da IA.
 *
 * Heurística semântica — não depende de palavras específicas:
 *   1. Mensagem curta (< 60 chars) — mensagem longa provavelmente é nova instrução
 *   2. Sem negações explícitas
 *   3. A IA havia prometido fazer algo (verificar, enviar, buscar, etc.)
 *
 * Isso cobre qualquer variação afirmativa do português sem precisar enumerar palavras.
 */
function ehRespostaPositiva(mensagem: string, ultimaMsgIA: string): boolean {
  const txt = mensagem.trim()

  // Mensagem longa provavelmente é nova instrução, não confirmação
  if (txt.length > 60) return false

  // Termina com "?" → é pergunta, não confirmação
  if (txt.endsWith('?')) return false

  // Negação explícita
  const negacoes = /\b(não|nao|nunca|jamais|negativo|n[ãa]o\s+quero|n[ãa]o\s+preciso|cancela|desist)\b/i
  if (negacoes.test(txt)) return false

  // A IA havia prometido executar uma ação
  const iaPrometeuAcao = /\b(verificar|consultar|buscar|checar|ver|procurar|listar|mostrar|enviar|mandar|reenviar|encaminhar|abrir|criar|gerar|emitir|reenvio)\b/i
  return iaPrometeuAcao.test(ultimaMsgIA)
}

/**
 * Extrai a instrução relevante da última mensagem da IA para reusar em confirmações.
 * Quando a IA prometeu enviar um documento, a instrução gerada já inclui enviarDocumentoWhatsApp.
 */
function extrairInstrucaoDaIA(ultimaMsgIA: string, mensagemUsuario: string): string {
  const prometeuEnvio = /\b(enviar|mandar|reenviar|encaminhar)\b/i.test(ultimaMsgIA)
  const mencionouDoc  = ENVIO_KEYWORDS.test(ultimaMsgIA)

  if (prometeuEnvio && mencionouDoc) {
    // Extrai o tipo de documento mencionado pela IA para tornar a instrução precisa
    const match = ultimaMsgIA.match(ENVIO_KEYWORDS)
    const tipoDoc = match ? match[0].toLowerCase() : 'documento'
    return `Buscar ${tipoDoc} mais recente do cliente e enviar via WhatsApp usando enviarDocumentoWhatsApp. Contexto da IA: "${ultimaMsgIA.slice(0, 200)}"`
  }

  return `O usuário confirmou prosseguir com a ação prometida pela IA: "${ultimaMsgIA.slice(0, 200)}". Executar a ação correspondente.`
}

function classificarPorKeyword(mensagem: string, ultimaMsgIA?: string): Intencao {
  const ehRelatorio = /\b(relat[oó]rio|gera[r]?.*resumo|monta[r]?.*relat|cria[r]?.*relat)\b/i.test(mensagem)

  // Resposta positiva a uma promessa da IA → executa a ação prometida
  if (ultimaMsgIA && ehRespostaPositiva(mensagem, ultimaMsgIA)) {
    return {
      tipo:      'acao',
      instrucao: extrairInstrucaoDaIA(ultimaMsgIA, mensagem),
    }
  }

  // Consulta financeira — situação de cobrança requer dados reais, não RAG
  if (FINANCEIRO_KEYWORDS.test(mensagem)) {
    const pedidoSegundaVia = /\b(segunda\s*via|pix\s*expir|boleto\s*n[aã]o|n[aã]o\s*recebi)\b/i.test(mensagem)
    const pedidoExtrato    = /\b(extrato|hist[oó]rico.*pag|paguei)\b/i.test(mensagem)
    if (pedidoSegundaVia) {
      return { tipo: 'acao', instrucao: 'Gerar segunda via da cobrança em aberto do cliente usando gerarSegundaViaAsaas' }
    }
    if (pedidoExtrato) {
      return { tipo: 'acao', instrucao: 'Buscar extrato financeiro do cliente usando extratoFinanceiro' }
    }
    return { tipo: 'acao', instrucao: 'Buscar cobranças do cliente usando listarCobrancasCliente para informar situação financeira' }
  }

  // Pedido direto de envio de documento → inclui enviarDocumentoWhatsApp na instrução
  const pedidoEnvio = /\b(manda[r]?|envia[r]?|reenv[ia]+[r]?|encaminha[r]?|quero|preciso|me\s+passa)\b/i.test(mensagem)
  if (pedidoEnvio && ENVIO_KEYWORDS.test(mensagem)) {
    const match   = mensagem.match(ENVIO_KEYWORDS)
    const tipoDoc = match ? match[0].toLowerCase() : 'documento'
    return {
      tipo:      'acao',
      instrucao: `Buscar ${tipoDoc} mais recente do cliente e enviar via WhatsApp usando enviarDocumentoWhatsApp`,
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

/** Substitui instrução de envio WhatsApp por busca com link quando o canal é portal */
function adaptarInstrucaoPortal(intencao: Intencao): Intencao {
  if (!intencao.instrucao) return intencao
  if (!intencao.instrucao.includes('enviarDocumentoWhatsApp')) return intencao
  return {
    ...intencao,
    instrucao: intencao.instrucao.replace(
      /enviar via WhatsApp usando enviarDocumentoWhatsApp/g,
      'buscar e apresentar links de download usando buscarDocumentos',
    ),
  }
}

export async function classificarIntencao(
  mensagem: string,
  contexto?: string,
  ultimaMsgIA?: string,
  canal?: string,
): Promise<Intencao> {
  try {
    const config = await getAiConfig()

    // Sem Anthropic → fallback por heurística semântica
    if (!config.anthropicApiKey) {
      const r = classificarPorKeyword(mensagem, ultimaMsgIA)
      return canal === 'portal' ? adaptarInstrucaoPortal(r) : r
    }

    const provider = getProvider('claude')
    const prompt = contexto
      ? `Contexto: ${contexto}\n\nMensagem: "${mensagem}"`
      : `Mensagem: "${mensagem}"`

    const result = await provider.complete({
      system:      SYSTEM_CLASSIFICADOR,
      messages:    [{ role: 'user', content: prompt }],
      maxTokens:   100,
      temperature: 0,
      model:       'claude-haiku-4-5-20251001',  // sempre haiku — só precisa de velocidade
      apiKey:      config.anthropicApiKey,
    })

    const parsed = JSON.parse(result.text.trim()) as Intencao
    if (parsed.tipo !== 'pergunta' && parsed.tipo !== 'acao') return { tipo: 'pergunta' }
    return canal === 'portal' ? adaptarInstrucaoPortal(parsed) : parsed
  } catch (err) {
    console.error('[classificar-intencao] falha na classificação IA, usando heurística:', err)
    // Parse/rede falhou → heurística semântica como fallback
    const r = classificarPorKeyword(mensagem, ultimaMsgIA)
    return canal === 'portal' ? adaptarInstrucaoPortal(r) : r
  }
}
