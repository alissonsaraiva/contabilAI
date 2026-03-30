/**
 * POST /api/crm/clientes/[id]/documentos
 *
 * Upload de documento para um cliente via CRM (origem: 'crm').
 * Aceita multipart/form-data com os campos:
 *   arquivo    File     (obrigatório)
 *   tipo       string   (ex: 'Nota Fiscal', 'Guia DAS')
 *   categoria  CategoriaDocumento  (opcional)
 *   empresaId  string   (opcional — para PJ, vincula também à empresa)
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { criarDocumento } from '@/lib/services/documentos'
import type { CategoriaDocumento } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: clienteId } = await params

  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: { id: true, empresaId: true },
  })
  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const formData  = await req.formData()
  const file      = formData.get('arquivo')   as File | null
  const tipo      = (formData.get('tipo')     as string) || 'documento'
  const categoria = formData.get('categoria') as CategoriaDocumento | null
  const empresaIdForm = formData.get('empresaId') as string | null

  if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

  const MAX_SIZE = 25 * 1024 * 1024 // 25 MB (CRM staff)
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Arquivo muito grande. O limite é 25 MB.' }, { status: 413 })
  }

  const bytes  = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // PJ: prefere empresaId do form, senão usa da relação do cliente
  const empresaId = empresaIdForm || cliente.empresaId || undefined

  const documento = await criarDocumento({
    clienteId,
    empresaId,
    arquivo: {
      buffer,
      nome:     file.name,
      mimeType: file.type || 'application/octet-stream',
    },
    tipo,
    categoria: categoria ?? undefined,
    origem:    'crm',
  })

  return NextResponse.json(documento, { status: 201 })
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: clienteId } = await params

  const documentos = await prisma.documento.findMany({
    where:   { clienteId },
    orderBy: { criadoEm: 'desc' },
    select: {
      id: true, nome: true, tipo: true, categoria: true,
      origem: true, url: true, mimeType: true, tamanho: true,
      status: true, criadoEm: true, ordemServicoId: true,
    },
  })

  return NextResponse.json(documentos.map(d => ({ ...d, tamanho: d.tamanho != null ? Number(d.tamanho) : null })))
}
