import { auth } from '@/lib/auth'
import { getUploadUrl, storageKeys } from '@/lib/storage'
import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'

export async function POST(req: Request) {
  // Upload público para leads no onboarding — não requer auth
  const { tipo, entidadeId, entidadeTipo, contentType } = await req.json()

  if (!tipo || !entidadeId || !contentType) {
    return NextResponse.json({ error: 'Parâmetros obrigatórios: tipo, entidadeId, contentType' }, { status: 400 })
  }

  let key: string
  if (entidadeTipo === 'lead') {
    key = storageKeys.documentoLead(entidadeId, `${tipo}-${nanoid(6)}`)
  } else if (entidadeTipo === 'escritorio') {
    key = tipo === 'logo' ? storageKeys.logoEscritorio() : storageKeys.faviconEscritorio()
  } else {
    key = storageKeys.documentoCliente(entidadeId, `${tipo}-${nanoid(6)}`)
  }

  const uploadUrl = await getUploadUrl(key, contentType)
  const publicUrl = `${process.env.STORAGE_PUBLIC_URL}/${key}`

  return NextResponse.json({ uploadUrl, publicUrl, key })
}
