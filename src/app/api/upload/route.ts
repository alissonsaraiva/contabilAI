import * as Sentry from '@sentry/nextjs'
import { auth } from '@/lib/auth'
import { uploadArquivo, storageKeys } from '@/lib/storage'
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
  'application/xml',  // XMLs fiscais: NFe, CT-e, NFS-e
  'text/xml',         // variante alternativa de XML enviada por alguns browsers
])

// Tipos de entidade permitidos
const ALLOWED_TIPO = new Set(['contrato', 'documento', 'rg', 'cpf', 'cnpj', 'comprovante', 'logo', 'favicon', 'outro'])

/**
 * POST /api/upload
 *
 * Aceita multipart/form-data com os campos:
 *   file       — o arquivo a ser enviado
 *   tipo       — categoria do arquivo (padrão: 'outro')
 *   entidadeId — ID da entidade (cliente, lead, escritório etc.)
 *   entidadeTipo — 'lead' | 'cliente' | 'escritorio' | 'socio'
 *
 * Faz upload direto server-side para o R2.
 * Evita o padrão anterior de URL presignada + PUT do browser, que exigia
 * configuração de CORS no bucket R2 e causava "TypeError: Failed to fetch"
 * quando o CORS não estava configurado.
 *
 * Retorna: { publicUrl: string }
 */
export async function POST(req: Request) {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch (err) {
    return NextResponse.json({ error: 'Requisição inválida: esperado multipart/form-data' }, { status: 400 })
  }

  const file        = formData.get('file') as File | null
  const tipo        = (formData.get('tipo')        as string | null) ?? 'outro'
  const entidadeId  = formData.get('entidadeId')   as string | null
  const entidadeTipo = formData.get('entidadeTipo') as string | null

  if (!file || !entidadeId) {
    return NextResponse.json({ error: 'Parâmetros obrigatórios: file, entidadeId' }, { status: 400 })
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'Tipo de arquivo não permitido' }, { status: 400 })
  }

  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'Arquivo muito grande. O limite é 25 MB.' }, { status: 400 })
  }

  // Escritório: requer autenticação CRM
  if (entidadeTipo === 'escritorio') {
    const session = await auth()
    const userTipo = (session?.user as { tipo?: string })?.tipo
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

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const publicUrl = await uploadArquivo(key, buffer, file.type)
    return NextResponse.json({ publicUrl, key })
  } catch (err) {
    console.error('[upload] falha ao enviar para storage:', { key, contentType: file.type, err })
    Sentry.captureException(err, {
      tags:  { module: 'upload', operation: 'uploadArquivo' },
      extra: { key, contentType: file.type, entidadeId, entidadeTipo },
    })
    return NextResponse.json({ error: 'Serviço de storage indisponível. Tente novamente.' }, { status: 502 })
  }
}
