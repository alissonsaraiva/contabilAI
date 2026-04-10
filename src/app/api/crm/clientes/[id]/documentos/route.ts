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
import * as Sentry from '@sentry/nextjs'
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
  const visivelPortalRaw = formData.get('visivelPortal') as string | null
  const visivelPortal = visivelPortalRaw === 'false' ? false : true
  const dataVencimentoRaw = formData.get('dataVencimento') as string | null
  const dataVencimento = dataVencimentoRaw || null

  if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

  const MAX_SIZE = 25 * 1024 * 1024 // 25 MB (CRM staff)
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Arquivo muito grande. O limite é 25 MB.' }, { status: 413 })
  }

  const bytes  = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // PJ: prefere empresaId do form, senão resolve do cliente (legado → junção 1:N)
  let empresaId: string | undefined = empresaIdForm || cliente.empresaId || undefined
  if (!empresaId) {
    const vinculo = await prisma.clienteEmpresa.findFirst({
      where: { clienteId, principal: true },
      select: { empresaId: true },
    })
    empresaId = vinculo?.empresaId ?? undefined
  }

  let documento: Awaited<ReturnType<typeof criarDocumento>>
  try {
    documento = await criarDocumento({
      clienteId,
      empresaId,
      arquivo: {
        buffer,
        nome:     file.name,
        mimeType: file.type || 'application/octet-stream',
      },
      tipo,
      categoria: categoria ?? undefined,
      visivelPortal,
      dataVencimento,
      origem:    'crm',
    })
  } catch (err) {
    console.error('[crm/clientes/documentos] falha ao salvar documento:', err)
    Sentry.captureException(err, { tags: { module: 'crm-documentos', operation: 'criar-documento' }, extra: { clienteId } })
    return NextResponse.json({ error: 'Falha ao enviar o documento. Tente novamente.' }, { status: 502 })
  }

  return NextResponse.json(documento, { status: 201 })
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: clienteId } = await params

  // Resolve empresaId para incluir documentos de clientes PJ (armazenados sob empresaId)
  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: { empresaId: true },
  })

  // Agrega documentos de todas as empresas vinculadas (1:N)
  const orConditions: object[] = [{ clienteId }]
  if (cliente?.empresaId) orConditions.push({ empresaId: cliente.empresaId })
  const vinculos = await prisma.clienteEmpresa.findMany({
    where: { clienteId },
    select: { empresaId: true },
  })
  for (const v of vinculos) {
    if (v.empresaId !== cliente?.empresaId) {
      orConditions.push({ empresaId: v.empresaId })
    }
  }

  const documentos = await prisma.documento.findMany({
    where:   { OR: orConditions, deletadoEm: null },
    orderBy: { criadoEm: 'desc' },
    select: {
      id: true, nome: true, tipo: true, categoria: true,
      origem: true, url: true, mimeType: true, tamanho: true,
      status: true, criadoEm: true, ordemServicoId: true,
      visivelPortal: true, xmlMetadata: true, resumoStatus: true,
      observacao: true, visualizadoEm: true, dataVencimento: true,
    },
  })

  return NextResponse.json(documentos.map(d => ({ ...d, tamanho: d.tamanho != null ? Number(d.tamanho) : null })))
}
