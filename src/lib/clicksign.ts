/**
 * Cliente ClickSign — assinatura eletrônica brasileira.
 * API Key configurada em CRM → Configurações → Integrações.
 * Documentação: https://developers.clicksign.com
 */

import * as Sentry from '@sentry/nextjs'
import { decrypt, isEncrypted } from '@/lib/crypto'

const BASE_URL = 'https://app.clicksign.com'

function resolveKey(raw: string): string {
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
      // AbortError (timeout) NÃO é retryável: o request pode ter chegado ao servidor
      // e criado o documento antes do timeout — retry criaria duplicatas.
      const isRetryable = /ClickSign (500|502|503|504)/.test(msg)
      if (!isRetryable) break
      // Backoff: 1s, 3s
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
  throw lastError
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
    /**
     * ClickSign retorna downloads como objeto, não array.
     * Campos: signed_file_url, original_file_url.
     */
    downloads?: {
      signed_file_url?: string
      original_file_url?: string
    }
    /**
     * Signatários vinculados ao documento.
     * A API retorna `url` (usando request_signature_key) após o vínculo via /api/v1/lists.
     */
    signers?: Array<{
      key: string
      request_signature_key?: string
      url?: string
    }>
  }
}

type ClickSignSigner = {
  signer: {
    key: string
    email: string
    name: string
  }
}

type ClickSignList = {
  list: {
    document_key: string
    signer_key: string
    sign_as: string
    sign_url?: string
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

  // 1. Cria o documento (com retry)
  const docResp = await withRetry(() =>
    clicksignFetch<ClickSignDocument>(apiKey, '/api/v1/documents', {
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
    }),
  )

  const docKey = docResp.document.key

  // Loga o docKey ANTES de chamar os próximos passos.
  // Se os passos 2 ou 3 falharem, este log permite localizar e cancelar
  // o documento órfão manualmente no painel da ClickSign.
  console.info(`[ClickSign] Documento criado: ${docKey} — prosseguindo com signatário e vínculo`)

  // 2. Cria o signatário (com retry — usa docKey já conhecido)
  let signerResp: ClickSignSigner
  try {
    signerResp = await withRetry(() =>
      clicksignFetch<ClickSignSigner>(apiKey, '/api/v1/signers', {
        method: 'POST',
        json: {
          signer: {
            email: signatario.email,
            name: signatario.nome,
            auths: ['email'],
            delivery: 'email',
          },
        },
      }),
    )
  } catch (err) {
    Sentry.captureException(err, {
      tags: { module: 'clicksign', operation: 'criar-signatario' },
      extra: { docKey, signatarioEmail: signatario.email },
    })
    throw new Error(
      `ClickSign: falha ao criar signatário para documento ${docKey}. ` +
      `Acesse o painel da ClickSign e cancele/remova o documento manualmente. ` +
      `Erro original: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const signerKey = signerResp.signer.key

  // 3. Vincula signatário ao documento e solicita notificação por e-mail (com retry)
  let listResp: ClickSignList
  try {
    listResp = await withRetry(() =>
      clicksignFetch<ClickSignList>(apiKey, '/api/v1/lists', {
        method: 'POST',
        json: {
          list: {
            document_key: docKey,
            signer_key: signerKey,
            sign_as: 'contractee',
            refusable: false,
            communicate_events: { sign_as: true, view_as: false },
            message: 'Você recebeu um contrato para assinatura eletrônica.',
          },
        },
      }),
    )
  } catch (err) {
    Sentry.captureException(err, {
      tags: { module: 'clicksign', operation: 'vincular-signatario' },
      extra: { docKey, signerKey, signatarioEmail: signatario.email },
    })
    throw new Error(
      `ClickSign: falha ao vincular signatário ${signerKey} ao documento ${docKey}. ` +
      `Acesse o painel da ClickSign e finalize o vínculo ou cancele o documento manualmente. ` +
      `Erro original: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  // 4. Busca o documento para obter a sign_url do signatário vinculado.
  // A ClickSign popula document.signers[].url (via request_signature_key) somente
  // após o vínculo via /api/v1/lists — não está disponível nas respostas dos POSTs.
  let signUrl: string | null =
    listResp.list.sign_url ?? null

  if (!signUrl) {
    let docResp2: ClickSignDocument
    try {
      docResp2 = await withRetry(() =>
        clicksignFetch<ClickSignDocument>(apiKey, `/api/v1/documents/${docKey}`, { method: 'GET' }),
      )
    } catch (err) {
      Sentry.captureException(err, {
        tags: { module: 'clicksign', operation: 'buscar-documento-sign-url' },
        extra: { docKey, signerKey },
      })
      throw new Error(
        `ClickSign: falha ao buscar URL de assinatura para o documento ${docKey}. ` +
        `Erro original: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    const signerInDoc = docResp2.document.signers?.find((s) => s.key === signerKey)
    signUrl = signerInDoc?.url ?? null
  }

  if (!signUrl) {
    Sentry.captureMessage('ClickSign: sign_url não encontrada mesmo após GET do documento', {
      level: 'error',
      tags: { module: 'clicksign', operation: 'sign-url' },
      extra: { docKey, signerKey },
    })
    throw new Error(
      `ClickSign: não foi possível obter a URL de assinatura para o documento ${docKey}. ` +
      `Verifique o plano contratado ou consulte o suporte da ClickSign.`,
    )
  }

  return { docKey, signUrl }
}
