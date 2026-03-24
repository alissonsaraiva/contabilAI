import { NextResponse } from 'next/server'

type Params = { params: Promise<{ cep: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { cep } = await params
  const cleaned = cep.replace(/\D/g, '')
  if (cleaned.length !== 8) {
    return NextResponse.json({ error: 'CEP inválido' }, { status: 400 })
  }

  const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`)
  if (!res.ok) return NextResponse.json({ error: 'CEP não encontrado' }, { status: 404 })
  const data = await res.json()
  if (data.erro) return NextResponse.json({ error: 'CEP não encontrado' }, { status: 404 })

  return NextResponse.json({
    logradouro: data.logradouro,
    bairro: data.bairro,
    cidade: data.localidade,
    uf: data.uf,
    cep: data.cep,
  })
}
