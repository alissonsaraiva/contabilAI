import { indexar, getEmbeddingKeys } from './_core'

// ─── Relatório do Agente ──────────────────────────────────────────────────────

type RelatorioAgenteData = {
  id: string
  titulo: string
  conteudo: string
  tipo: string          // 'agendado' | 'manual'
  sucesso: boolean
  agendamentoDesc?: string | null
  criadoPorNome?: string | null
  criadoEm?: Date
}

// Indexa relatórios gerados pela IA no canal CRM.
// Permite que o assistente responda "o que o relatório da semana passada dizia?" via RAG.
// Relatórios com sucesso=false (erros) não são indexados — conteúdo pode ser incompleto.
export async function indexarRelatorio(rel: RelatorioAgenteData): Promise<void> {
  if (!rel.sucesso) return   // não indexa execuções com erro

  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const data = rel.criadoEm ? rel.criadoEm.toLocaleDateString('pt-BR') : ''

  // Extrai texto plano do conteúdo (JSON estruturado ou texto livre)
  let conteudoTexto = rel.conteudo
  try {
    const { relatorioJSONParaTexto, parseRelatorioJSON } = await import('@/lib/relatorio-schema')
    const parsed = parseRelatorioJSON(rel.conteudo)
    if (parsed) conteudoTexto = relatorioJSONParaTexto(parsed)
  } catch {
    // fallback para texto bruto
  }

  const linhas = [
    `Relatório gerado pela IA: ${rel.titulo}`,
    `Tipo: ${rel.tipo === 'agendado' ? 'Agendamento automático' : 'Manual'}`,
    rel.agendamentoDesc ? `Agendamento: ${rel.agendamentoDesc}` : '',
    rel.criadoPorNome   ? `Solicitado por: ${rel.criadoPorNome}` : '',
    data                ? `Gerado em: ${data}` : '',
    ``,
    conteudoTexto,
  ].filter(v => v !== null && v !== undefined).join('\n')

  await indexar(linhas, {
    escopo:      'global',
    canal:       'crm',
    tipo:        'historico_crm',
    documentoId: `relatorio:${rel.id}`,
    titulo:      `Relatório — ${rel.titulo}`,
  }, keys)
}

// ─── Ação do Agente (AgenteAcao) ──────────────────────────────────────────────

type AgenteAcaoData = {
  id: string
  clienteId?: string | null
  leadId?: string | null
  tool: string
  solicitanteAI: string
  usuarioNome?: string | null
  input: unknown
  resultado: { sucesso?: boolean; resumo?: string; erro?: string; dados?: unknown }
  sucesso: boolean
  duracaoMs: number
  criadoEm?: Date
}

// Indexa ações executadas pelo agente operacional no tipo 'historico_agente'.
// Permite que a IA responda "o que foi feito para o cliente X?" via RAG sem
// recorrer ao banco, e aprenda padrões de sucesso/falha por tool ao longo do tempo.
// Indexa ações bem-sucedidas e falhas (com prefixo [FALHA]) para aprendizado de padrões.
export async function indexarAgenteAcao(acao: AgenteAcaoData): Promise<void> {
  if (!acao.clienteId && !acao.leadId) return  // sem contexto de entidade

  const resumo = acao.resultado?.resumo?.trim()
  const erro   = acao.resultado?.erro?.trim()

  // Falhas: indexa com prefixo [FALHA] para permitir diagnóstico de padrões recorrentes
  if (!acao.sucesso) {
    if (!erro || erro.length < 5) return
    const resumoFalha = `[FALHA] ${acao.tool}: ${erro}`
    const keys = await getEmbeddingKeys()
    if (!keys.openai && !keys.voyage) return
    const data = acao.criadoEm ? acao.criadoEm.toLocaleDateString('pt-BR') : ''
    const linhasErr = [
      resumoFalha,
      `Canal: ${acao.solicitanteAI}`,
      data ? `Data: ${data}` : '',
    ].filter(Boolean).join('\n')
    await indexar(linhasErr, {
      escopo:    acao.clienteId ? 'cliente' : 'lead',
      canal:     'crm',
      tipo:      'historico_crm' as const,
      clienteId: acao.clienteId ?? undefined,
      leadId:    acao.leadId    ?? undefined,
      titulo:    `[FALHA] ${acao.tool}`,
    }, keys)
    return
  }

  if (!resumo || resumo.length < 5) return  // sem resumo útil

  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const data = acao.criadoEm ? acao.criadoEm.toLocaleDateString('pt-BR') : ''
  const hora = acao.criadoEm
    ? acao.criadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : ''

  // Serializa o input de forma legível (omite campos sensíveis longos)
  let inputResumido = ''
  try {
    const inp = acao.input as Record<string, unknown>
    inputResumido = Object.entries(inp)
      .filter(([, v]) => v != null && String(v).length < 200)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ')
  } catch { /* ignora */ }

  const linhas = [
    `Ação do agente: ${acao.tool}`,
    `Canal: ${acao.solicitanteAI}`,
    data ? `Data: ${data}${hora ? ' às ' + hora : ''}` : '',
    acao.usuarioNome ? `Solicitado por: ${acao.usuarioNome}` : '',
    inputResumido    ? `Parâmetros: ${inputResumido}` : '',
    `Resultado: ${resumo}`,
    `Duração: ${acao.duracaoMs}ms`,
  ].filter(Boolean).join('\n')

  await indexar(linhas, {
    escopo:      acao.clienteId ? 'cliente' : 'lead',
    canal:       'crm',
    tipo:        'historico_agente',
    clienteId:   acao.clienteId ?? undefined,
    leadId:      acao.leadId    ?? undefined,
    titulo:      `Ação ${acao.tool} — ${data}`,
    documentoId: `agente_acao:${acao.id}`,
  }, keys)
}

// ─── Agendamento do Agente ─────────────────────────────────────────────────────

type AgendamentoData = {
  id: string
  descricao: string
  cron: string
  instrucao: string
  ativo: boolean
  criadoPorNome?: string | null
  ultimoDisparo?: Date | null
  proximoDisparo?: Date | null
}

// Indexa agendamentos ativos no canal CRM (escopo global do escritório).
// Permite que a IA responda "o que está agendado?" sem precisar chamar a tool
// listarAgendamentos em consultas simples — economiza tokens e latência.
// Agendamentos inativos são removidos do índice.
export async function indexarAgendamento(ag: AgendamentoData): Promise<void> {
  const documentoId = `agendamento:${ag.id}`

  if (!ag.ativo) {
    import('@/lib/rag').then(({ deleteEmbeddings }) =>
      deleteEmbeddings({ documentoId })
    ).catch((err: unknown) => {
      console.warn('[ingest] falha ao deletar embeddings de agendamento inativo:', { documentoId, err })
    })
    return
  }

  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const ultimoStr   = ag.ultimoDisparo   ? ag.ultimoDisparo.toLocaleDateString('pt-BR')   : 'nunca'
  const proximoStr  = ag.proximoDisparo  ? ag.proximoDisparo.toLocaleDateString('pt-BR')  : 'não calculado'

  const linhas = [
    `Agendamento ativo do agente`,
    `Descrição: ${ag.descricao}`,
    `Instrução: ${ag.instrucao}`,
    `Cron: ${ag.cron}`,
    `Criado por: ${ag.criadoPorNome ?? 'sistema'}`,
    `Último disparo: ${ultimoStr}`,
    `Próximo disparo: ${proximoStr}`,
  ].filter(Boolean).join('\n')

  await indexar(linhas, {
    escopo:      'global',
    canal:       'crm',
    tipo:        'base_conhecimento',
    documentoId,
    titulo:      `Agendamento — ${ag.descricao}`,
  }, keys)
}
