/**
 * indexarAsync — wrapper unificado para indexação RAG fire-and-forget.
 *
 * Substitui o padrão espalhado em ~48 locais:
 *   import('@/lib/rag/ingest').then(({ indexarX }) => indexarX(...)).catch(() => {})
 *
 * Uso:
 *   indexarAsync('interacao', { id, clienteId, tipo, titulo, conteudo, criadoEm })
 *   indexarAsync('cliente', { id, nome, email, ... })
 *   indexarAsync('escalacao', { id, canal, motivoIA, ... })
 */

type TipoIndexacao =
  | 'interacao'
  | 'cliente'
  | 'lead'
  | 'escalacao'
  | 'tarefa'
  | 'contrato'
  | 'documento'
  | 'escritorio'
  | 'planos'

export function indexarAsync(tipo: TipoIndexacao, dados: unknown): void {
  import('@/lib/rag/ingest')
    .then((mod) => {
      switch (tipo) {
        case 'interacao': return (mod as any).indexarInteracao(dados)
        case 'cliente':   return (mod as any).indexarCliente(dados)
        case 'lead':      return (mod as any).indexarLead(dados)
        case 'escalacao': return (mod as any).indexarEscalacao?.(dados)
        case 'tarefa':    return (mod as any).indexarTarefa?.(dados)
        case 'contrato':  return (mod as any).indexarContrato?.(dados)
        case 'documento': return (mod as any).indexarDocumento?.(dados)
        case 'escritorio': return (mod as any).indexarEscritorio?.(dados)
        case 'planos':    return (mod as any).indexarPlanos?.(dados)
      }
    })
    .catch(() => {
      // RAG nunca bloqueia nem propaga erro — operação best-effort
    })
}
