/**
 * Helpers para criar Request/Response mock em testes de API routes.
 */

interface MockRequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: unknown
  url?: string
}

export function createMockRequest(options: MockRequestOptions = {}): Request {
  const { method = 'POST', headers = {}, body, url = 'http://localhost:3000/api/test' } = options

  const init: RequestInit = {
    method,
    headers: new Headers(headers),
  }

  if (body !== undefined) {
    init.body = JSON.stringify(body)
    ;(init.headers as Headers).set('content-type', 'application/json')
  }

  return new Request(url, init)
}
