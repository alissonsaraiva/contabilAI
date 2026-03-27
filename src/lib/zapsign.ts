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

  const doc = await zapsignFetch<ZapSignDoc>(token, '/docs/', {
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
  })

  const signer = doc.signers[0]
  if (!signer) throw new Error('ZapSign: nenhum signatário retornado')

  return { docToken: doc.token, signUrl: signer.sign_url }
}
