import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const esc = await prisma.escalacao.findUnique({
    where: { id },
    select: { status: true, respostaEnviada: true },
  })
  if (!esc) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ status: esc.status, resposta: esc.respostaEnviada ?? null })
}
