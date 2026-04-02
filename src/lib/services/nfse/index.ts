// Barrel — re-exports públicos de lib/services/nfse/
// Mantém compatibilidade com os 13 importadores de @/lib/services/notas-fiscais

export type { EmitirNotaInput, EmitirNotaResult, EmitirNotaErro, EmitirNotaOutput } from './tipos'
export { montarWebhookUrl }                                                          from './config'
export { sincronizarEmpresaNaSpedy }                                                 from './sincronizar'
export { verificarConfiguracaoNfse }                                                 from './verificar'
export { emitirNotaFiscal }                                                          from './emissao'
export { reemitirNotaFiscal }                                                        from './reemissao'
export { cancelarNotaFiscal }                                                        from './cancelamento'
export { entregarNotaCliente }                                                       from './entrega'
export { onNotaAutorizada, onNotaRejeitada, onNotaCancelada }                        from './eventos'
export { processarWebhookSpedy }                                                     from './webhook'
