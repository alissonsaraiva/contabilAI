import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { uploadArquivo } from '@/lib/storage'
import { resolveClienteId } from '@/lib/portal-session'
import { parseXML } from '@/lib/xml-parser'

export async function POST(req: Request) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  const formData = await req.formData()
  const file     = formData.get('file') as File | null
  const tipo     = (formData.get('tipo') as string) || 'outros'

  if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

  const bytes    = await file.arrayBuffer()
  const buffer   = Buffer.from(bytes)
  const fileName = file.name
  const mime     = file.type || 'application/octet-stream'
  const size     = buffer.byteLength

  const isXML = mime === 'text/xml' || mime === 'application/xml' || fileName.toLowerCase().endsWith('.xml')

  // Build storage key
  const ext = fileName.split('.').pop() ?? 'bin'
  const key = `clientes/${clienteId}/portal/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const url = await uploadArquivo(key, buffer, mime)

  // Parse XML if applicable
  let xmlMetadata = null
  let tipoFinal   = tipo
  if (isXML) {
    const text = buffer.toString('utf-8')
    xmlMetadata = parseXML(text)
    // Override tipo based on parsed XML type
    if (xmlMetadata.tipo !== 'desconhecido') tipoFinal = xmlMetadata.tipo
  }

  const documento = await prisma.documento.create({
    data: {
      clienteId,
      tipo:         tipoFinal,
      nome:         fileName,
      url,
      tamanho:      size,
      mimeType:     mime,
      status:       'enviado',
      origemPortal: true,
      xmlMetadata:  xmlMetadata as any,
    },
  })

  return NextResponse.json(documento)
}
