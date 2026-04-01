/**
 * Thin logger wrapper — mantém compatibilidade com código que importa @/lib/logger.
 * Em produção os logs aparecem no stdout do container (coletado pelo Docker/systemd).
 */

type LogMeta = Record<string, unknown>

function formatMsg(tag: string, meta?: LogMeta): string {
  return meta ? `[${tag}] ${JSON.stringify(meta)}` : `[${tag}]`
}

export const logger = {
  info:  (tag: string, meta?: LogMeta) => console.log(formatMsg(tag, meta)),
  warn:  (tag: string, meta?: LogMeta) => console.warn(formatMsg(tag, meta)),
  error: (tag: string, meta?: LogMeta) => console.error(formatMsg(tag, meta)),
  debug: (tag: string, meta?: LogMeta) => {
    if (process.env.LOG_LEVEL === 'debug') console.debug(formatMsg(tag, meta))
  },
}
