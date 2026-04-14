/**
 * Traduz erros técnicos da Evolution API para mensagens legíveis pelo operador.
 *
 * O campo `detail` / `erroEnvio` contém strings brutas como:
 *   "circuit breaker aberto — Evolution API temporariamente indisponível"
 *   "Evolution API 404: ..."
 *   "AbortError"
 *   "socket hang up"
 *   "fetch failed"
 *   "disconnected"
 *
 * Esta função mapeia esses padrões para mensagens em PT-BR acionáveis.
 */
export function humanizarErroWhatsApp(erro: string | null | undefined): string {
  if (!erro) return 'Não foi possível entregar ao WhatsApp. Verifique a conexão da instância.'

  const d = erro.toLowerCase()

  if (d.includes('circuit breaker'))
    return 'WhatsApp temporariamente indisponível. Tente novamente em alguns minutos.'

  if (d.includes('abort') || d.includes('timed out') || d.includes('timeout'))
    return 'Tempo limite excedido. A mensagem ficou salva — pode já ter chegado ao destinatário.'

  if (d.includes('disconnected') || d.includes('not connected') || d.includes('desconectado'))
    return 'WhatsApp desconectado. Reconecte a instância nas configurações e tente novamente.'

  if (d.includes('fetch failed') || d.includes('socket') || d.includes('econnrefused') || d.includes('network'))
    return 'Falha de conexão com o WhatsApp. Verifique se a instância está online.'

  if (d.includes('404') || d.includes('not found'))
    return 'Número não encontrado no WhatsApp. Verifique se o contato possui WhatsApp.'

  if (d.includes('403') || d.includes('forbidden') || d.includes('blocked'))
    return 'Envio bloqueado. O contato pode ter bloqueado o número.'

  if (d.includes('400') || d.includes('bad request'))
    return 'Mensagem rejeitada pelo WhatsApp. Verifique o conteúdo e tente novamente.'

  if (d.includes('429') || d.includes('rate limit') || d.includes('too many'))
    return 'Limite de envios atingido. Aguarde alguns instantes e tente novamente.'

  if (d.includes('500') || d.includes('502') || d.includes('503'))
    return 'Erro no servidor do WhatsApp. Tente novamente em instantes.'

  return 'Não foi possível entregar ao WhatsApp. Verifique a conexão da instância.'
}
