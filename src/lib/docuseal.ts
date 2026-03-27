/**
 * Cliente DocuSeal — assinatura eletrônica self-hosted.
 * Requer DOCUSEAL_API_URL e DOCUSEAL_API_KEY no .env.
 *
 * DOCUSEAL_TEMPLATE_ID é opcional (legado). A abordagem atual cria um
 * template dinâmico por contrato a partir do PDF gerado com os dados reais
 * do cliente — eliminando a necessidade de configurar um template fixo.
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

type DocuSealTemplate = { id: number; name: string; slug?: string }

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
 * Cria uma submissão para um template existente pelo ID.
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
 * Cria um template DocuSeal a partir de um PDF gerado dinamicamente e,
 * em seguida, cria uma submissão para assinatura eletrônica.
 *
 * O campo de assinatura é posicionado sobre a área de assinatura do
 * CONTRATANTE na última página do PDF (coordenadas relativas 0–1).
 *
 * Coordenadas calculadas para o template ContratoPDF (A4, fonte 9.5pt):
 *   - Coluna direita (CONTRATANTE) começa em x ≈ 0.54 da página
 *   - Linha de assinatura está a ~y ≈ 0.82 da página (no rodapé)
 */
export async function enviarContratoParaAssinatura(
  pdfBuffer: Buffer,
  nomeContrato: string,
  signatario: { nome: string; email: string },
): Promise<{ templateId: number; submissionId: number; signUrl: string }> {
  const base64Pdf = pdfBuffer.toString('base64')

  // Cria o template com o PDF personalizado e define o campo de assinatura
  const template = await docusealFetch<DocuSealTemplate>('/api/templates', {
    method: 'POST',
    json: {
      name: nomeContrato,
      documents: [
        {
          name: 'contrato.pdf',
          file: `data:application/pdf;base64,${base64Pdf}`,
          fields: [
            {
              name: 'Assinatura',
              type: 'signature',
              role: 'First Party',
              required: true,
              areas: [
                {
                  // Coluna direita (CONTRATANTE), linha de assinatura
                  // A4 paddingHorizontal: 60, largura útil: 475pt
                  // Coluna direita começa em ~55% da largura útil → x ≈ 0.54
                  // Linha de assinatura a ~82% da altura da página (última página)
                  x: 0.54,
                  y: 0.82,
                  w: 0.36,
                  h: 0.04,
                  page: 0,
                },
              ],
            },
          ],
        },
      ],
    },
  })

  const tmplId = template.id
  if (!tmplId) throw new Error('DocuSeal: template criado sem ID na resposta')

  const { submissionId, signUrl } = await criarSubmissao(tmplId, signatario)
  return { templateId: tmplId, submissionId, signUrl }
}
