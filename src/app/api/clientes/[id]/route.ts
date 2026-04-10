import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { deleteEmbeddings } from '@/lib/rag/store'
import { vincularEmpresa } from '@/lib/clientes/vincular-empresa'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      empresa: {
        include: {
          socios: {
            select: { id: true, nome: true, cpf: true, email: true, qualificacao: true, participacao: true, portalAccess: true, criadoEm: true },
          },
        },
      },
      clienteEmpresas: {
        include: {
          empresa: {
            include: {
              socios: {
                select: { id: true, nome: true, cpf: true, email: true, qualificacao: true, participacao: true, portalAccess: true, criadoEm: true },
              },
            },
          },
        },
        orderBy: { principal: 'desc' },
      },
      documentos: {
        where:   { deletadoEm: null },
        select: { id: true, nome: true, tipo: true, categoria: true, status: true, origem: true, criadoEm: true, tamanho: true, mimeType: true, url: true },
        orderBy: { criadoEm: 'desc' },
      },
      contratos: {
        select: { id: true, status: true, planoTipo: true, valorMensal: true, vencimentoDia: true, formaPagamento: true, assinadoEm: true, criadoEm: true },
        orderBy: { criadoEm: 'desc' },
      },
      interacoes: {
        select: { id: true, tipo: true, titulo: true, conteudo: true, origem: true, criadoEm: true },
        orderBy: { criadoEm: 'desc' },
        take: 50,
      },
    },
  })
  if (!cliente) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(cliente)
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  // Separar campos do Cliente dos campos da Empresa
  const { cnpj, razaoSocial, nomeFantasia, regime, ...clienteData } = body
  const empresaFields = { cnpj: cnpj || null, razaoSocial: razaoSocial || null, nomeFantasia: nomeFantasia || null, regime: regime || null }
  const temCamposEmpresa = 'cnpj' in body || 'razaoSocial' in body || 'nomeFantasia' in body || 'regime' in body

  const cliente = await prisma.$transaction(async (tx) => {
    const updated = await tx.cliente.update({
      where: { id },
      data: clienteData,
      include: { empresa: { include: { socios: true } } },
    })

    if (temCamposEmpresa) {
      if (updated.empresaId) {
        await tx.empresa.update({ where: { id: updated.empresaId }, data: empresaFields })
      } else {
        // Cliente sem empresa ainda — cria e vincula (ambos: legado + junção)
        const empresa = await tx.empresa.create({ data: empresaFields })
        await vincularEmpresa(tx, id, empresa.id)
        if (empresaFields.cnpj) {
          await tx.cliente.update({ where: { id }, data: { tipoContribuinte: 'pj' } })
        }
      }
    }

    return tx.cliente.findUnique({
      where: { id },
      include: {
        empresa: { include: { socios: true } },
        clienteEmpresas: {
          include: { empresa: { include: { socios: true } } },
          orderBy: { principal: 'desc' },
        },
        contratos: { orderBy: { criadoEm: 'desc' }, take: 1 },
      },
    })
  })

  if (cliente) {
    const empPrincipal = cliente.clienteEmpresas?.[0]?.empresa ?? cliente.empresa
    const contratoAtual = cliente.contratos?.[0] ?? null
    indexarAsync('cliente', {
      ...cliente,
      cnpj: empPrincipal?.cnpj ?? null,
      razaoSocial: empPrincipal?.razaoSocial ?? null,
      nomeFantasia: empPrincipal?.nomeFantasia ?? null,
      regime: empPrincipal?.regime ?? null,
      socios: empPrincipal?.socios ?? [],
      contrato: contratoAtual ? {
        planoTipo:     contratoAtual.planoTipo,
        valorMensal:   contratoAtual.valorMensal,
        vencimentoDia: contratoAtual.vencimentoDia,
        formaPagamento: contratoAtual.formaPagamento,
        assinadoEm:    contratoAtual.assinadoEm,
      } : null,
    })
  }

  return NextResponse.json(cliente)
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await prisma.cliente.delete({ where: { id } })

  // Limpa todos os embeddings do cliente (tarefas, interações, documentos, dados_empresa, etc.)
  deleteEmbeddings({ clienteId: id }).catch(() => {})

  return NextResponse.json({ ok: true })
}
