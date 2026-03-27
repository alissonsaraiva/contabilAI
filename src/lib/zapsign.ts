/**
 * Cliente ZapSign — assinatura eletrônica brasileira.
 * Requer ZAPSIGN_API_TOKEN no .env (Dashboard → Configurações → Integrações → API Token).
 *
 * Documentação: https://docs.zapsign.com.br
 */

const BASE_URL = 'https://api.zapsign.com.br/api/v1'

function apiToken() {
  return process.env.ZAPSIGN_API_TOKEN ?? ''
}

export function zapsignConfigurado(): boolean {
  return !!process.env.ZAPSIGN_API_TOKEN
}

async function zapsignFetch<T>(path: string, options: { method?: string; json?: unknown }): Promise<T> {
  const token = apiToken()
  if (!token) throw new Error('ZapSign não configurado: defina ZAPSIGN_API_TOKEN no .env')

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  let body: string | undefined

  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.json)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000) // PDF upload pode demorar
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

/**
 * Envia um PDF para assinatura eletrônica via ZapSign.
 * Retorna o token do documento e a URL de assinatura do signatário.
 *
 * O base64 deve ser raw (sem prefixo data:application/pdf;base64,).
 */
export async function enviarContratoParaAssinatura(
  pdfBuffer: Buffer,
  nomeContrato: string,
  signatario: { nome: string; email: string },
): Promise<{ docToken: string; signUrl: string }> {
  const base64Pdf = pdfBuffer.toString('base64')

  const doc = await zapsignFetch<ZapSignDoc>('/docs/', {
    method: 'POST',
    json: {
      name: nomeContrato,
      base64_pdf: base64Pdf,
      signers: [
        {
          name:                  signatario.nome,
          email:                 signatario.email,
          auth_mode:             'tokenEmail', // valida identidade por token no e-mail
          send_automatic_email:  true,
        },
      ],
    },
  })

  const signer = doc.signers[0]
  if (!signer) throw new Error('ZapSign: nenhum signatário retornado')

  return {
    docToken: doc.token,
    signUrl:  signer.sign_url,
  }
}

/**
 * Busca o status e a URL de assinatura atualizada de um documento.
 */
export async function buscarDocumento(docToken: string): Promise<ZapSignDoc> {
  return zapsignFetch<ZapSignDoc>(`/docs/${docToken}/`, {})
}
