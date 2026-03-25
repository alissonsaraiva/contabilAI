import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const createSchema = z.object({
  nome: z.string().min(2, 'Nome obrigatório'),
  cpf: z.string().min(11, 'CPF inválido'),
  email: z.string().email('E-mail inválido'),
  telefone: z.string().min(8, 'Telefone inválido'),
  planoTipo: z.enum(['essencial', 'profissional', 'empresarial', 'startup']),
  valorMensal: z.coerce.number().positive('Valor inválido'),
  vencimentoDia: z.coerce.number().int().min(1).max(31),
  formaPagamento: z.enum(['pix', 'boleto', 'cartao']),
  cnpj: z.string().optional(),
  razaoSocial: z.string().optional(),
  regime: z.enum(['MEI', 'SimplesNacional', 'LucroPresumido', 'LucroReal', 'Autonomo']).optional(),
  cidade: z.string().optional(),
  uf: z.string().max(2).optional(),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const cliente = await prisma.cliente.create({
      data: {
        ...parsed.data,
        responsavelId: (session.user as any).id,
      },
    })

    import('@/lib/rag/ingest').then(({ indexarCliente }) => indexarCliente(cliente)).catch(() => {})

    return NextResponse.json(cliente, { status: 201 })
  } catch (e: any) {
    if (e.code === 'P2002') {
      return NextResponse.json({ error: 'CPF ou e-mail já cadastrado' }, { status: 409 })
    }
    throw e
  }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status')
  const plano = searchParams.get('plano')

  const clientes = await prisma.cliente.findMany({
    where: {
      AND: [
        q
          ? {
              OR: [
                { nome: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { cpf: { contains: q.replace(/\D/g, '') } },
              ],
            }
          : {},
        status ? { status: status as any } : {},
        plano ? { planoTipo: plano as any } : {},
      ],
    },
    orderBy: { criadoEm: 'desc' },
    include: { responsavel: { select: { id: true, nome: true } } },
  })

  return NextResponse.json(clientes)
}
