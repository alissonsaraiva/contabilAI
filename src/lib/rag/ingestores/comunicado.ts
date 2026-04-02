import { indexar, getEmbeddingKeys } from './_core'

// ─── Comunicado ───────────────────────────────────────────────────────────────

type ComunicadoData = {
  id: string
  titulo: string
  conteudo: string
  tipo: string
  publicado: boolean
  publicadoEm?: Date | null
  expiradoEm?: Date | null
  anexoNome?: string | null
}

// Indexa comunicados publicados no canal 'geral' — visível para todas as IAs.
// Comunicados não publicados são removidos do índice.
export async function indexarComunicado(comunicado: ComunicadoData): Promise<void> {
  const documentoId = `comunicado:${comunicado.id}`

  if (!comunicado.publicado) {
    // Remove do índice se despublicado ou deletado
    import('@/lib/rag').then(({ deleteEmbeddings }) =>
      deleteEmbeddings({ documentoId })
    ).catch(err => console.error('[rag/ingest] erro ao remover comunicado:', err))
    return
  }

  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const publicadoStr   = comunicado.publicadoEm ? comunicado.publicadoEm.toLocaleDateString('pt-BR') : ''
  const expiracao      = comunicado.expiradoEm  ? comunicado.expiradoEm.toLocaleDateString('pt-BR')  : ''

  const linhas = [
    `Comunicado: ${comunicado.titulo}`,
    `Tipo: ${comunicado.tipo}`,
    publicadoStr ? `Publicado em: ${publicadoStr}` : '',
    expiracao    ? `Válido até: ${expiracao}` : '',
    comunicado.anexoNome ? `Anexo disponível: ${comunicado.anexoNome}` : '',
    ``,
    comunicado.conteudo,
  ].filter(v => v !== undefined && v !== null && v !== '').join('\n')

  await indexar(linhas, {
    escopo:      'global',
    canal:       'geral',
    tipo:        'base_conhecimento',
    documentoId,
    titulo:      `Comunicado — ${comunicado.titulo}`,
  }, keys)
}
