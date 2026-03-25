import { prisma } from '@/lib/prisma'
import { getDownloadUrl, storageKeys } from '@/lib/storage'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params

  const contrato = await prisma.contrato.findUnique({ where: { leadId: id } })
  if (!contrato?.pdfUrl) {
    return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 })
  }

  const key = storageKeys.contratoLead(id)
  const signedUrl = await getDownloadUrl(key, 3600)

  return NextResponse.redirect(signedUrl)
}
