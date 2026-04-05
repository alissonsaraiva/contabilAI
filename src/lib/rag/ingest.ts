/**
 * Ponto de entrada unificado para todos os ingestores RAG.
 *
 * Re-exporta tudo dos módulos individuais em lib/rag/ingestores/.
 * Manter este barrel garante compatibilidade retroativa com:
 *  - lib/rag/indexar-async.ts (import dinâmico)
 *  - app/api/rag/seed/route.ts (import estático)
 */

export { PLANOS_INFO, indexarEscritorio, indexarPlanos } from './ingestores/escritorio'
export { indexarLead, indexarContrato, migrarLeadParaCliente } from './ingestores/lead'
export { indexarCliente, indexarStatusHistorico, indexarEmpresa } from './ingestores/cliente'
export { indexarInteracao } from './ingestores/interacao'
export { indexarDocumento, indexarChamado } from './ingestores/documento'
export { indexarEscalacao } from './ingestores/escalacao'
export { indexarComunicado } from './ingestores/comunicado'
export { indexarConversa } from './ingestores/conversa'
export { indexarRelatorio, indexarAgenteAcao, indexarAgendamento } from './ingestores/agente'
export { indexarEmailClassificado } from './ingestores/email'
