/**
 * Status in-memory do último envio SMTP/Resend.
 * Atualizado por sendEmail() para rastrear erros de envio.
 */

export type SmtpSyncStatus = {
  status:      'nunca' | 'ok' | 'erro'
  ultimoEnvio: number | null   // Date.now()
  ultimoErro:  string | null
  provider:    'resend' | 'smtp' | null
}

declare global {
  // eslint-disable-next-line no-var
  var __smtpStatus: SmtpSyncStatus | undefined
}

function getStatus(): SmtpSyncStatus {
  if (!global.__smtpStatus) {
    global.__smtpStatus = { status: 'nunca', ultimoEnvio: null, ultimoErro: null, provider: null }
  }
  return global.__smtpStatus
}

export function getSmtpStatus(): SmtpSyncStatus {
  return getStatus()
}

export function setSmtpOk(provider: 'resend' | 'smtp'): void {
  global.__smtpStatus = { status: 'ok', ultimoEnvio: Date.now(), ultimoErro: null, provider }
}

export function setSmtpErro(erro: string, provider: 'resend' | 'smtp'): void {
  global.__smtpStatus = { status: 'erro', ultimoEnvio: Date.now(), ultimoErro: erro, provider }
}
