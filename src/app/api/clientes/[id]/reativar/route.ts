import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

// encerrado é irreversível via interface — requer intervenção manual
const TRANSICOES_PERMITIDAS = ['suspenso', 'cancelado', 'inadimplente']

export async function POST(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const cliente = await prisma.cliente.findUnique({ where: { id }, select: { id: true, status: true } })
  if (!cliente) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!TRANSICOES_PERMITIDAS.includes(cliente.status)) {
    return NextResponse.json({ error: 'transicao_invalida', detalhe: `Não é possível reativar um cliente com status "${cliente.status}"` }, { status: 422 })
  }

  const operador = (session.user as any)
  const now = new Date()

  const [atualizado] = await prisma.$transaction([
    prisma.cliente.update({
      where: { id },
      data: {
        status:           'ativo',
        motivoInativacao: null,
        inativadoEm:      null,
        inativadoPorId:   null,
        reativadoEm:      now,
      },
    }),
    prisma.clienteStatusHistorico.create({
      data: {
        clienteId:    id,
        statusAntes:  cliente.status,
        statusDepois: 'ativo',
        motivo:       null,
        operadorId:   operador.id ?? null,
        operadorNome: operador.name ?? null,
      },
    }),
  ])

  import('@/lib/rag/ingest').then(({ indexarCliente }) => indexarCliente(atualizado)).catch(() => {})

  return NextResponse.json({ ok: true, status: 'ativo' })
}
