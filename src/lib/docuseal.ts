/**
 * Cliente DocuSeal — assinatura eletrônica self-hosted.
 * Requer DOCUSEAL_API_URL, DOCUSEAL_API_KEY e DOCUSEAL_TEMPLATE_ID no .env.
 *
 * DocuSeal Community Edition (CE) não suporta criação de templates via API
 * (POST /submissions/pdf é Pro only). O template deve ser configurado uma vez
 * via painel DocuSeal (Upload PDF + campo Assinatura) e o ID informado em
 * DOCUSEAL_TEMPLATE_ID.
 *
 * Para PDF dinâmico por contrato (com dados do cliente), é necessário upgrade
 * para DocuSeal Pro: https://www.docuseal.com/pricing
 */

function baseUrl() {
  return (process.env.DOCUSEAL_API_URL ?? '').replace(/\/$/, '')
}

function apiKey() {
  return process.env.DOCUSEAL_API_KEY ?? ''
}

function templateId(): number | null {
  const id = process.env.DOCUSEAL_TEMPLATE_ID
  return id ? Number(id) : null
}

export function docusealConfigurado(): boolean {
  return !!(process.env.DOCUSEAL_API_URL && process.env.DOCUSEAL_API_KEY && process.env.DOCUSEAL_TEMPLATE_ID)
}

async function docusealFetch<T>(
  path: string,
  options: { method?: string; json?: unknown },
): Promise<T> {
  const url = `${baseUrl()}${path}`
  const key = apiKey()
  if (!url || !key) throw new Error('DocuSeal não configurado: defina DOCUSEAL_API_URL e DOCUSEAL_API_KEY')

  const headers: Record<string, string> = { 'X-Auth-Token': key }
  let body: string | undefined

  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.json)
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
 * Cria uma submissão para um template existente.
 * Retorna o ID da submissão e a URL de assinatura do signatário.
 */
export async function criarSubmissao(
  tmplId: number,
  signatario: { nome: string; email: string },
  sendEmail = true,
): Promise<{ submissionId: number; signUrl: string }> {
  const data = await docusealFetch<DocuSealSubmitter[]>('/api/submissions', {
    method: 'POST',
    json: {
      template_id: tmplId,
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
 * Cria uma submissão usando o template fixo (DOCUSEAL_TEMPLATE_ID).
 *
 * LIMITAÇÃO CE: o PDF exibido ao signatário é o template configurado
 * manualmente no painel DocuSeal — não o PDF dinâmico com dados do cliente.
 * Para PDFs dinâmicos por contrato, é necessário DocuSeal Pro.
 *
 * Setup necessário (uma vez, via painel):
 *   1. Abrir http://<DOCUSEAL_HOST>/
 *   2. Abrir o template ID=DOCUSEAL_TEMPLATE_ID
 *   3. Fazer upload de um PDF base do contrato
 *   4. Arrastar o campo "Assinatura" para a área de assinatura
 *   5. Salvar
 */
export async function enviarContratoParaAssinatura(
  _pdfBuffer: Buffer,
  _nomeContrato: string,
  signatario: { nome: string; email: string },
): Promise<{ templateId: number; submissionId: number; signUrl: string }> {
  const tmplId = templateId()
  if (!tmplId) throw new Error('DOCUSEAL_TEMPLATE_ID não configurado. Crie um template no painel DocuSeal e defina esta variável.')

  const { submissionId, signUrl } = await criarSubmissao(tmplId, signatario)
  return { templateId: tmplId, submissionId, signUrl }
}
