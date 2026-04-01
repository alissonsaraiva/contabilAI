import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getDownloadUrl, storageKeys } from '@/lib/storage'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const contrato = await prisma.contrato.findUnique({
    where:  { leadId: id },
    select: { pdfUrl: true, lead: { select: { responsavelId: true } } },
  })
  if (!contrato?.pdfUrl) {
    return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 })
  }

  // Apenas admins/contadores ou o responsável pelo lead podem baixar
  const user = session.user as any
  if (user.tipo !== 'admin' && user.tipo !== 'contador' && contrato.lead?.responsavelId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const key = storageKeys.contratoLead(id)

  let signedUrl: string
  try {
    signedUrl = await getDownloadUrl(key, 300) // 5 min
  } catch (err) {
    console.error('[contrato/download] falha ao gerar URL assinada:', err)
    return NextResponse.json({ error: 'Não foi possível gerar o link de download. Tente novamente.' }, { status: 502 })
  }

  return NextResponse.redirect(signedUrl)
}
