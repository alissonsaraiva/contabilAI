import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { decrypt, isEncrypted } from '@/lib/crypto'

type Params = { params: Promise<{ id: string }> }

function resolveKey(raw: string): string {
  return isEncrypted(raw) ? decrypt(raw) : raw
}

async function buscarPdfClickSign(clicksignKey: string, apiKey: string): Promise<string | null> {
  const key = resolveKey(apiKey)
  const url = `https://app.clicksign.com/api/v1/documents/${clicksignKey}?access_token=${key}`

  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`ClickSign ${res.status}: ${await res.text()}`)

  const data = (await res.json()) as {
    document?: {
      downloads?: { url?: string }[]
      original_file_url?: string
    }
  }

  return data.document?.downloads?.[0]?.url ?? data.document?.original_file_url ?? null
}

async function buscarPdfZapSign(docToken: string, rawToken: string): Promise<string | null> {
  const token = resolveKey(rawToken)
  const url = `https://api.zapsign.com.br/api/v1/docs/${docToken}/`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`ZapSign ${res.status}: ${await res.text()}`)

  const data = (await res.json()) as { signed_file?: string | null }
  return data.signed_file ?? null
}

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params

  const [contrato, escritorio] = await Promise.all([
    prisma.contrato.findUnique({ where: { id } }),
    prisma.escritorio.findFirst(),
  ])

  if (!contrato) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 })
  if (contrato.status !== 'assinado') {
    return NextResponse.json({ error: 'Contrato ainda não está assinado' }, { status: 422 })
  }

  const provedor = escritorio?.provedorAssinatura ?? 'zapsign'

  let pdfUrl: string | null = null

  try {
    if (provedor === 'clicksign') {
      if (!contrato.clicksignKey) {
        return NextResponse.json({ error: 'clicksignKey ausente no contrato' }, { status: 422 })
      }
      const apiKey = escritorio?.clicksignKey ?? ''
      if (!apiKey) return NextResponse.json({ error: 'ClickSign não configurado' }, { status: 503 })
      pdfUrl = await buscarPdfClickSign(contrato.clicksignKey, apiKey)
    } else {
      if (!contrato.zapsignDocToken) {
        return NextResponse.json({ error: 'zapsignDocToken ausente no contrato' }, { status: 422 })
      }
      const token = escritorio?.zapsignToken ?? ''
      if (!token) return NextResponse.json({ error: 'ZapSign não configurado' }, { status: 503 })
      pdfUrl = await buscarPdfZapSign(contrato.zapsignDocToken, token)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Erro ao buscar PDF: ${msg}` }, { status: 502 })
  }

  if (!pdfUrl) {
    return NextResponse.json({ error: 'PDF ainda não disponível na plataforma de assinatura' }, { status: 404 })
  }

  await prisma.contrato.update({ where: { id }, data: { pdfUrl } })

  return NextResponse.json({ ok: true, pdfUrl })
}
