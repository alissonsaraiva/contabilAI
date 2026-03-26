// Cliente para Evolution API (open-source WhatsApp API)
// Docs: https://doc.evolution-api.com

export type EvolutionConfig = {
  baseUrl: string
  apiKey: string
  instance: string
}

async function evo(cfg: EvolutionConfig, method: string, path: string, body?: unknown) {
  const url = `${cfg.baseUrl.replace(/\/$/, '')}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: cfg.apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = { raw: text } }

  if (!res.ok) throw new Error(`Evolution API ${res.status}: ${text.slice(0, 200)}`)
  return json
}

// Cria instância
export async function createInstance(cfg: EvolutionConfig) {
  return evo(cfg, 'POST', '/instance/create', {
    instanceName: cfg.instance,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
  })
}

// Retorna QR code (base64) e status de conexão
export async function getConnectionState(cfg: EvolutionConfig) {
  return evo(cfg, 'GET', `/instance/connectionState/${cfg.instance}`)
}

// Conecta (gera novo QR)
export async function connectInstance(cfg: EvolutionConfig) {
  return evo(cfg, 'GET', `/instance/connect/${cfg.instance}`)
}

// Desconecta (logout WhatsApp)
export async function logoutInstance(cfg: EvolutionConfig) {
  return evo(cfg, 'DELETE', `/instance/logout/${cfg.instance}`)
}

// Deleta instância
export async function deleteInstance(cfg: EvolutionConfig) {
  return evo(cfg, 'DELETE', `/instance/delete/${cfg.instance}`)
}

// Envia mensagem de texto
export async function sendText(cfg: EvolutionConfig, to: string, text: string) {
  // "to" pode ser "5511999999999" ou "5511999999999@s.whatsapp.net"
  const number = to.replace('@s.whatsapp.net', '').replace('@g.us', '')
  return evo(cfg, 'POST', `/message/sendText/${cfg.instance}`, { number, text })
}

// Configura webhook da instância
export async function setWebhook(cfg: EvolutionConfig, webhookUrl: string) {
  return evo(cfg, 'POST', `/webhook/set/${cfg.instance}`, {
    url: webhookUrl,
    webhook_by_events: false,
    webhook_base64: false,
    events: ['MESSAGES_UPSERT'],
  })
}

// Envia indicador de digitação (composing) por durationMs milissegundos
export async function sendPresence(cfg: EvolutionConfig, to: string, durationMs: number = 2000) {
  const number = to.replace('@s.whatsapp.net', '').replace('@g.us', '')
  try {
    return await evo(cfg, 'POST', `/chat/sendPresence/${cfg.instance}`, {
      number,
      options: { presence: 'composing', delay: durationMs },
    })
  } catch {
    // Ignora erros de presença — não crítico
  }
}
