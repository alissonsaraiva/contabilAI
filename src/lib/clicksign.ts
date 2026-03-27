/**
 * Cliente ClickSign — assinatura eletrônica brasileira.
 * API Key configurada em CRM → Configurações → Integrações.
 * Documentação: https://developers.clicksign.com
 */

import { decrypt, isEncrypted } from '@/lib/crypto'

const BASE_URL = 'https://app.clicksign.com'

function resolveKey(raw: string): string {
  return isEncrypted(raw) ? decrypt(raw) : raw
}

async function clicksignFetch<T>(apiKey: string, path: string, options: { method?: string; json?: unknown }): Promise<T> {
  const sep = path.includes('?') ? '&' : '?'
  const url = `${BASE_URL}${path}${sep}access_token=${apiKey}`

  const headers: Record<string, string> = {}
  let body: string | undefined

  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    headers['Accept'] = 'application/json'
    body = JSON.stringify(options.json)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  let res: Response
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ClickSign ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ClickSignDocument = {
  document: {
    key: string
    path: string
    status: string
    original_file_url?: string
  }
}

type ClickSignSigner = {
  signer: {
    key: string
    email: string
    name: string
    token: string
  }
}

type ClickSignList = {
  list: {
    document_key: string
    signer_key: string
    sign_as: string
    widget_key?: string
    token?: string
  }
}

// ─── Funções públicas ─────────────────────────────────────────────────────────

export async function enviarClickSign(
  rawKey: string,
  pdfBuffer: Buffer,
  nomeContrato: string,
  signatario: { nome: string; email: string },
): Promise<{ docKey: string; signUrl: string }> {
  const apiKey = resolveKey(rawKey)
  const base64Pdf = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`

  // 1. Cria o documento
  const docResp = await clicksignFetch<ClickSignDocument>(apiKey, '/api/v1/documents', {
    method: 'POST',
    json: {
      document: {
        path: `/contratos/${Date.now()}-${nomeContrato.slice(0, 40).replace(/[^a-zA-Z0-9]/g, '-')}.pdf`,
        content_base64: base64Pdf,
        deadline_at: null,
        auto_close: true,
        locale: 'pt-BR',
        sequence_enabled: false,
      },
    },
  })

  const docKey = docResp.document.key

  // 2. Cria o signatário
  const signerResp = await clicksignFetch<ClickSignSigner>(apiKey, '/api/v1/signers', {
    method: 'POST',
    json: {
      signer: {
        email: signatario.email,
        name: signatario.nome,
        has_documentation: false,
        auth: 'email',
      },
    },
  })

  const signerKey = signerResp.signer.key

  // 3. Vincula signatário ao documento
  const listResp = await clicksignFetch<ClickSignList>(apiKey, '/api/v1/lists', {
    method: 'POST',
    json: {
      list: {
        document_key: docKey,
        signer_key: signerKey,
        sign_as: 'contractee',
        refusable: false,
      },
    },
  })

  // 4. Notifica o signatário por e-mail
  await clicksignFetch<unknown>(apiKey, '/api/v1/notify_signers', {
    method: 'POST',
    json: { document_key: docKey },
  })

  const signerToken = listResp.list.token ?? listResp.list.widget_key ?? signerKey
  const signUrl = `https://app.clicksign.com/sign/${signerToken}`

  return { docKey, signUrl }
}
