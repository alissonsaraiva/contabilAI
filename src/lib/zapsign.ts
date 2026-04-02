/**
 * Cliente ZapSign — assinatura eletrônica brasileira.
 * Token configurado em CRM → Configurações → Integrações.
 * Documentação: https://docs.zapsign.com.br
 */

import { decrypt, isEncrypted } from '@/lib/crypto'

const BASE_URL = 'https://api.zapsign.com.br/api/v1'

function resolveToken(raw: string): string {
  return isEncrypted(raw) ? decrypt(raw) : raw
}

/**
 * Retry com backoff exponencial para erros de rede e 5xx.
 * Não retenta 4xx (erro do cliente — retentar não adianta).
 */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt >= maxAttempts) break
      const msg = err instanceof Error ? err.message : String(err)
      const isRetryable =
        (err instanceof Error && err.name === 'AbortError') ||
        /ZapSign (500|502|503|504)/.test(msg)
      if (!isRetryable) break
      // Backoff: 1s, 3s
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
  throw lastError
}

async function zapsignFetch<T>(token: string, path: string, options: { method?: string; json?: unknown }): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  let body: string | undefined

  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.json)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
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
    throw new Error(`ZapSign ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ZapSignSigner = {
  token: string
  sign_url: string
  status: string
  name: string
  email: string
  signed_at: string | null
}

type ZapSignDoc = {
  token: string
  open_id: number
  status: 'pending' | 'signed'
  name: string
  original_file: string
  signed_file: string | null
  created_at: string
  signers: ZapSignSigner[]
}

// ─── Funções públicas ─────────────────────────────────────────────────────────

export async function enviarZapSign(
  rawToken: string,
  pdfBuffer: Buffer,
  nomeContrato: string,
  signatario: { nome: string; email: string },
): Promise<{ docToken: string; signUrl: string }> {
  const token = resolveToken(rawToken)
  const base64Pdf = pdfBuffer.toString('base64')

  const doc = await withRetry(() =>
    zapsignFetch<ZapSignDoc>(token, '/docs/', {
      method: 'POST',
      json: {
        name: nomeContrato,
        base64_pdf: base64Pdf,
        signers: [
          {
            name:                 signatario.nome,
            email:                signatario.email,
            auth_mode:            'tokenEmail',
            send_automatic_email: true,
          },
        ],
      },
    }),
  )

  const signer = doc.signers[0]
  if (!signer) throw new Error('ZapSign: nenhum signatário retornado')
  if (!signer.sign_url) throw new Error('ZapSign: sign_url ausente na resposta')

  return { docToken: doc.token, signUrl: signer.sign_url }
}
