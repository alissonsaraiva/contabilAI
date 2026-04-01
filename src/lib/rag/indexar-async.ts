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

import * as Sentry from '@sentry/nextjs'

type TipoIndexacao =
  | 'interacao'
  | 'cliente'
  | 'lead'
  | 'escalacao'
  | 'contrato'
  | 'documento'
  | 'escritorio'
  | 'planos'
  | 'os'
  | 'comunicado'
  | 'statusHistorico'
  | 'empresa'
  | 'relatorio'
  | 'conversa'
  | 'agenteAcao'    // ação executada pelo agente operacional — indexada em historico_agente
  | 'agendamento'   // agendamento do agente — indexado em base_conhecimento global

export function indexarAsync(tipo: TipoIndexacao, dados: unknown): void {
  import('@/lib/rag/ingest')
    .then((mod) => {
      switch (tipo) {
        case 'interacao':       return (mod as any).indexarInteracao(dados)
        case 'cliente':         return (mod as any).indexarCliente(dados)
        case 'lead':            return (mod as any).indexarLead(dados)
        case 'escalacao':       return (mod as any).indexarEscalacao?.(dados)
        case 'contrato':        return (mod as any).indexarContrato?.(dados)
        case 'documento':       return (mod as any).indexarDocumento?.(dados)
        case 'escritorio':      return (mod as any).indexarEscritorio?.(dados)
        case 'planos':          return (mod as any).indexarPlanos?.(dados)
        case 'os':              return (mod as any).indexarOrdemServico?.(dados)
        case 'comunicado':      return (mod as any).indexarComunicado?.(dados)
        case 'statusHistorico': return (mod as any).indexarStatusHistorico?.(dados)
        case 'empresa':         return (mod as any).indexarEmpresa?.(dados)
        case 'relatorio':       return (mod as any).indexarRelatorio?.(dados)
        case 'conversa':        return (mod as any).indexarConversa?.(dados)
        case 'agenteAcao':      return (mod as any).indexarAgenteAcao?.(dados)
        case 'agendamento':     return (mod as any).indexarAgendamento?.(dados)
      }
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[rag/indexar-async] falha ao indexar:', { tipo, msg })
      Sentry.captureException(err, { tags: { module: 'rag-indexar-async', tipo } })
    })
}
