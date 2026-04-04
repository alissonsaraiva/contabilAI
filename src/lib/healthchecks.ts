/**
 * Utilitário para pings no healthchecks.io.
 * Fire-and-forget — nunca bloqueia nem lança exceção.
 *
 * UUIDs configurados via variáveis de ambiente:
 *   HC_EMAIL_SYNC, HC_RECONCILIAR_NOTAS, HC_RETRY_DOCUMENTOS,
 *   HC_AGENTE, HC_PROCESSAR_PENDENTES
 */
async function hcPing(uuid: string | undefined, suffix = ''): Promise<void> {
  if (!uuid) return
  try {
    await fetch(`https://hc-ping.com/${uuid}${suffix}`, {
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // não bloqueia o cron se o healthchecks.io estiver indisponível
  }
}

export const hc = {
  start: (uuid: string | undefined) => hcPing(uuid, '/start'),
  ok:    (uuid: string | undefined) => hcPing(uuid),
  fail:  (uuid: string | undefined) => hcPing(uuid, '/fail'),
}
