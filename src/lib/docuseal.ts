/**
 * Cliente DocuSeal — assinatura eletrônica self-hosted.
 * Requer DOCUSEAL_API_URL e DOCUSEAL_API_KEY no .env
 */

function baseUrl() {
  return (process.env.DOCUSEAL_API_URL ?? '').replace(/\/$/, '')
}

function apiKey() {
  return process.env.DOCUSEAL_API_KEY ?? ''
}

export function docusealConfigurado(): boolean {
  return !!(process.env.DOCUSEAL_API_URL && process.env.DOCUSEAL_API_KEY)
}

async function docusealFetch<T>(
  path: string,
  options: { method?: string; json?: unknown; body?: FormData },
): Promise<T> {
  const url = `${baseUrl()}${path}`
  const key = apiKey()
  if (!url || !key) throw new Error('DocuSeal não configurado: defina DOCUSEAL_API_URL e DOCUSEAL_API_KEY')

  const headers: Record<string, string> = { 'X-Auth-Token': key }
  let body: BodyInit | undefined

  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.json)
  } else if (options.body) {
    body = options.body
    // FormData — não definir Content-Type (fetch define multipart/form-data automaticamente)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  let res: Response
  try {
    res = await fetch(url, { method: options.method ?? 'GET', headers, body, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`DocuSeal ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}

// ─── Tipos da API DocuSeal ────────────────────────────────────────────────────

type DocuSealTemplate = { id: number; name: string }

type DocuSealSubmitter = {
  id: number
  submission_id: number
  email: string
  name: string
  slug: string
  sign_url: string
  status: string
}

// ─── Funções públicas ─────────────────────────────────────────────────────────

/**
 * Faz upload de um PDF e cria um template no DocuSeal.
 * Retorna o ID do template criado.
 */
export async function criarTemplate(pdfBuffer: Buffer, nome: string): Promise<number> {
  const form = new FormData()
  form.append('name', nome)
  form.append(
    'documents[][file]',
    new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' }),
    'contrato.pdf',
  )

  const data = await docusealFetch<DocuSealTemplate>('/api/templates', {
    method: 'POST',
    body: form,
  })

  return data.id
}

/**
 * Cria uma submissão para um template existente com um único signatário.
 * Retorna o ID da submissão e a URL de assinatura do signatário.
 */
export async function criarSubmissao(
  templateId: number,
  signatario: { nome: string; email: string },
  sendEmail = true,
): Promise<{ submissionId: number; signUrl: string }> {
  const data = await docusealFetch<DocuSealSubmitter[]>('/api/submissions', {
    method: 'POST',
    json: {
      template_id: templateId,
      send_email: sendEmail,
      submitters: [{ name: signatario.nome, email: signatario.email }],
    },
  })

  const submitter = data[0]
  if (!submitter) throw new Error('DocuSeal: nenhum submitter retornado')

  return {
    submissionId: submitter.submission_id,
    signUrl: submitter.sign_url ?? `${baseUrl()}/s/${submitter.slug}`,
  }
}

/**
 * Fluxo completo: upload PDF → cria template → cria submissão → retorna URLs.
 */
export async function enviarContratoParaAssinatura(
  pdfBuffer: Buffer,
  nomeContrato: string,
  signatario: { nome: string; email: string },
): Promise<{ templateId: number; submissionId: number; signUrl: string }> {
  const templateId = await criarTemplate(pdfBuffer, nomeContrato)
  const { submissionId, signUrl } = await criarSubmissao(templateId, signatario)
  return { templateId, submissionId, signUrl }
}
