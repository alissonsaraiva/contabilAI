/**
 * GET /api/crm/contatos?q=...
 *
 * Busca rápida de clientes e sócios com WhatsApp/telefone cadastrado.
 * Usado no drawer "Nova mensagem" da central de atendimentos.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ clientes: [], socios: [] })

  const [clientes, socios] = await Promise.all([
    prisma.cliente.findMany({
      where: {
        AND: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { OR: [{ whatsapp: { not: null as any } }, { telefone: { not: null as any } }] },
          {
            OR: [
              { nome:  { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { empresa: { is: { razaoSocial: { contains: q, mode: 'insensitive' } } } },
            ],
          },
        ],
      },
      select: {
        id:       true,
        nome:     true,
        whatsapp: true,
        telefone: true,
        empresa:  { select: { razaoSocial: true } },
      },
      take: 8,
    }),
    prisma.socio.findMany({
      where: {
        AND: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { OR: [{ whatsapp: { not: null as any } }, { telefone: { not: null as any } }] },
          { nome: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id:       true,
        nome:     true,
        whatsapp: true,
        telefone: true,
        empresa:  { select: { razaoSocial: true, cliente: { select: { nome: true } } } },
      },
      take: 5,
    }),
  ])

  return NextResponse.json({ clientes, socios })
}
