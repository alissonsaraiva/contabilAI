/**
 * GET /api/cnpj/:cnpj
 *
 * Proxy público para consulta de CNPJ via BrasilAPI.
 * Não requer autenticação — dados são públicos da Receita Federal.
 * O cache server-side (24h) evita chamadas desnecessárias.
 *
 * Usado pelo hook useCnpj() e por qualquer tela que precise auto-preencher
 * dados de empresa a partir do CNPJ.
 */

import { NextResponse } from 'next/server'
import { consultarCNPJ } from '@/lib/cnpj'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ cnpj: string }> }
) {
  const { cnpj } = await params
  const digits = cnpj.replace(/\D/g, '')

  if (digits.length !== 14) {
    return NextResponse.json({ error: 'CNPJ deve ter 14 dígitos' }, { status: 400 })
  }

  try {
    const dados = await consultarCNPJ(digits)
    return NextResponse.json(dados)
  } catch (err) {
    const msg = (err as Error).message
    const status = msg.includes('não encontrado') ? 404 : 502
    return NextResponse.json({ error: msg }, { status })
  }
}
