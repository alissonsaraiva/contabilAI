import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Endpoint de polling usado pelo widget de onboarding para aguardar resposta humana.
// Requer sessionId como query param para validar ownership (impede leitura de escalações alheias).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')

  const esc = await prisma.escalacao.findUnique({
    where: { id },
    select: { status: true, respostaEnviada: true, sessionId: true },
  })
  if (!esc) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Valida ownership: escalação deve pertencer à mesma sessão que fez o poll
  if (sessionId && esc.sessionId && esc.sessionId !== sessionId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  return NextResponse.json({ status: esc.status, resposta: esc.respostaEnviada ?? null })
}
