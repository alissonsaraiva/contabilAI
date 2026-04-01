import { auth } from '@/lib/auth'
import { getUploadUrl, storageKeys } from '@/lib/storage'
import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'

// Tipos MIME permitidos para upload
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
])

// Tipos de entidade permitidos
const ALLOWED_TIPO = new Set(['contrato', 'documento', 'rg', 'cpf', 'cnpj', 'comprovante', 'logo', 'favicon', 'outro'])

export async function POST(req: Request) {
  // Upload público para leads no onboarding — não requer auth
  const { tipo, entidadeId, entidadeTipo, contentType } = await req.json()

  if (!tipo || !entidadeId || !contentType) {
    return NextResponse.json({ error: 'Parâmetros obrigatórios: tipo, entidadeId, contentType' }, { status: 400 })
  }

  if (!ALLOWED_MIME.has(contentType)) {
    return NextResponse.json({ error: 'Tipo de arquivo não permitido' }, { status: 400 })
  }

  // Escritório: requer autenticação
  if (entidadeTipo === 'escritorio') {
    const session = await auth()
    const userTipo = (session?.user as any)?.tipo
    if (!session || (userTipo !== 'admin' && userTipo !== 'contador')) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
  }

  let key: string
  if (entidadeTipo === 'lead') {
    key = storageKeys.documentoLead(entidadeId, `${tipo}-${nanoid(6)}`)
  } else if (entidadeTipo === 'escritorio') {
    key = tipo === 'logo' ? storageKeys.logoEscritorio() : storageKeys.faviconEscritorio()
  } else {
    key = storageKeys.documentoCliente(entidadeId, `${tipo}-${nanoid(6)}`)
  }

  let uploadUrl: string
  try {
    uploadUrl = await getUploadUrl(key, contentType)
  } catch (err) {
    console.error('[upload] falha ao gerar URL assinada:', err)
    return NextResponse.json({ error: 'Serviço de storage indisponível. Tente novamente.' }, { status: 502 })
  }

  const publicUrl = `${process.env.STORAGE_PUBLIC_URL}/${key}`

  return NextResponse.json({ uploadUrl, publicUrl, key })
}
