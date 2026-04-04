import { indexar, getEmbeddingKeys } from './_core'

// ─── Documento ───────────────────────────────────────────────────────────────

type DocumentoData = {
  id: string
  clienteId?: string | null
  empresaId?: string | null
  leadId?: string | null
  tipo: string
  nome: string
  categoria?: string | null
  origem: string
  criadoEm?: Date
  resumo?: string | null
}

// Indexa metadados de documento no canal CRM (e portal quando origem='portal').
// Cobre clienteId, leadId e empresaId — documentos com apenas empresaId são
// indexados usando o escopo 'cliente' com clienteId nulo (escopo global da empresa).
export async function indexarDocumento(doc: DocumentoData): Promise<void> {
  // Precisa de ao menos um vínculo para indexar
  if (!doc.clienteId && !doc.leadId && !doc.empresaId) return

  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const data = doc.criadoEm ? doc.criadoEm.toLocaleDateString('pt-BR') : ''

  const linhas = [
    `Documento: ${doc.nome}`,
    `Tipo: ${doc.tipo}`,
    doc.categoria ? `Categoria: ${doc.categoria}` : '',
    doc.resumo    ? `Resumo: ${doc.resumo}` : '',
    `Origem: ${doc.origem}`,
    data          ? `Enviado em: ${data}` : '',
  ].filter(Boolean).join('\n')

  // canal 'geral' para documentos crm/portal (Clara e CRM vêem com 1 entrada)
  // canal 'crm' para origens internas (cliente nunca veria de qualquer forma)
  const canalDoc = (doc.origem === 'portal' || doc.origem === 'crm') ? 'geral' : 'crm'

  await indexar(linhas, {
    escopo:      (doc.clienteId || doc.empresaId) ? 'cliente' as const : 'lead' as const,
    tipo:        'historico_crm' as const,
    clienteId:   doc.clienteId ?? undefined,
    leadId:      doc.leadId    ?? undefined,
    titulo:      `Documento — ${doc.nome}`,
    documentoId: `documento:${doc.id}`,
    canal:       canalDoc,
  }, keys)
}

// ─── Chamado ──────────────────────────────────────────────────────────────────

type ChamadoData = {
  id: string
  clienteId: string
  tipo: string
  titulo: string
  descricao: string
  status: string
  origem: string
  prioridade?: string | null
  visivelPortal?: boolean
  resposta?: string | null        // resolução do chamado pelo escritório
  respondidoEm?: Date | null
  avaliacaoNota?: number | null
  avaliacaoComent?: string | null
  criadoEm?: Date
}

// Indexa o chamado no canal CRM para que o assistente conheça os chamados abertos.
// Se visivelPortal=true, indexa também no canal portal (cliente pode perguntar).
// Inclui campo `resposta` para que o histórico de resolução fique acessível via RAG.
export async function indexarChamado(os: ChamadoData): Promise<void> {
  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const data = os.criadoEm ? os.criadoEm.toLocaleDateString('pt-BR') : ''
  const respondidoStr = os.respondidoEm ? os.respondidoEm.toLocaleDateString('pt-BR') : ''

  const linhas = [
    `Chamado: ${os.titulo}`,
    `Tipo: ${os.tipo}`,
    `Status: ${os.status}`,
    `Prioridade: ${os.prioridade ?? 'media'}`,
    `Origem: ${os.origem}`,
    data            ? `Aberto em: ${data}` : '',
    `Descrição: ${os.descricao}`,
    // Resolução — indexada para que a IA conheça como o chamado foi resolvido
    os.resposta     ? `\nResposta do escritório: ${os.resposta}` : '',
    respondidoStr   ? `Respondido em: ${respondidoStr}` : '',
    // Avaliação do cliente — contexto de satisfação
    os.avaliacaoNota    ? `Avaliação do cliente: ${os.avaliacaoNota}/5` : '',
    os.avaliacaoComent  ? `Comentário do cliente: ${os.avaliacaoComent}` : '',
  ].filter(Boolean).join('\n')

  const base = {
    escopo:      'cliente' as const,
    tipo:        'historico_crm' as const,
    clienteId:   os.clienteId,
    titulo:      `Chamado — ${os.titulo}`,
    documentoId: `os:${os.id}`,
  }

  // Chamado visível no portal → canal 'geral' (1 entrada cobre CRM + portal)
  // Chamado interno           → canal 'crm' apenas
  const canalOs = os.visivelPortal ? 'geral' : 'crm'
  await indexar(linhas, { ...base, canal: canalOs }, keys)
}
