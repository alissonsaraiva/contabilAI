/**
 * Status in-memory da última sincronização IMAP.
 * Armazenado em globalThis para sobreviver hot reloads no dev.
 */

export type ImapSyncStatus = {
  status:              'nunca' | 'ok' | 'erro'
  ultimaSync:          number | null   // Date.now()
  ultimoErro:          string | null
  falhasConsecutivas:  number
  processados:         number          // emails processados na última sync ok
  associados:          number          // emails associados a cliente/lead na última sync ok
  pausadoAte:          number | null   // circuit breaker: timestamp até quando não tentar (null = ativo)
}

declare global {
  // eslint-disable-next-line no-var
  var __imapSyncStatus: ImapSyncStatus | undefined
}

function getStatus(): ImapSyncStatus {
  if (!global.__imapSyncStatus) {
    global.__imapSyncStatus = {
      status:             'nunca',
      ultimaSync:         null,
      ultimoErro:         null,
      falhasConsecutivas: 0,
      processados:        0,
      associados:         0,
      pausadoAte:         null,
    }
  }
  return global.__imapSyncStatus
}

export function getImapSyncStatus(): ImapSyncStatus {
  return getStatus()
}

export function setImapSyncOk(processados: number, associados: number): void {
  global.__imapSyncStatus = {
    status:             'ok',
    ultimaSync:         Date.now(),
    ultimoErro:         null,
    falhasConsecutivas: 0,
    processados,
    associados,
    pausadoAte:         null,  // limpa circuit breaker ao recuperar
  }
}

export function setImapCircuitBreakerPausa(duracaoMs: number): void {
  const current = getStatus()
  global.__imapSyncStatus = {
    ...current,
    pausadoAte: Date.now() + duracaoMs,
  }
}

export function setImapSyncErro(erro: string): void {
  const current = getStatus()
  global.__imapSyncStatus = {
    ...current,
    status:             'erro',
    ultimaSync:         Date.now(),
    ultimoErro:         erro,
    falhasConsecutivas: current.falhasConsecutivas + 1,
  }
}
