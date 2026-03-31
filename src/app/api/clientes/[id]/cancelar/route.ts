import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { indexarAsync } from '@/lib/rag/indexar-async'

type Params = { params: Promise<{ id: string }> }

const TRANSICOES_PERMITIDAS = ['ativo', 'inadimplente', 'suspenso']

export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { motivo } = await req.json()

  const cliente = await prisma.cliente.findUnique({ where: { id }, select: { id: true, status: true } })
  if (!cliente) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!TRANSICOES_PERMITIDAS.includes(cliente.status)) {
    return NextResponse.json({ error: 'transicao_invalida', detalhe: `Não é possível cancelar um cliente com status "${cliente.status}"` }, { status: 422 })
  }

  const operador = (session.user as any)
  const now = new Date()

  const [atualizado, historico] = await prisma.$transaction([
    prisma.cliente.update({
      where: { id },
      data: {
        status:           'cancelado',
        motivoInativacao: motivo ?? null,
        inativadoEm:      now,
        inativadoPorId:   operador.id ?? null,
      },
    }),
    prisma.clienteStatusHistorico.create({
      data: {
        clienteId:    id,
        statusAntes:  cliente.status,
        statusDepois: 'cancelado',
        motivo:       motivo ?? null,
        operadorId:   operador.id ?? null,
        operadorNome: operador.name ?? null,
      },
    }),
  ])

  indexarAsync('cliente', atualizado)
  indexarAsync('statusHistorico', { ...historico, criadoEm: now })

  // Cancela subscription no Asaas (fire and forget)
  import('@/lib/services/asaas-sync')
    .then(({ suspenderAsaas }) => suspenderAsaas(id))
    .catch(err => console.error('[cancelar] Erro ao sincronizar Asaas:', err))

  return NextResponse.json({ ok: true, status: 'cancelado' })
}
