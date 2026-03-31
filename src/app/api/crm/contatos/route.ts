/**
 * GET /api/crm/contatos?q=...
 *
 * Busca rápida de clientes e sócios para o drawer "Nova mensagem".
 * Clientes: suportam WhatsApp (se tiver número) e Portal (sempre).
 * Sócios: suportam apenas WhatsApp.
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
        OR: [
          { nome:  { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { empresa: { is: { razaoSocial: { contains: q, mode: 'insensitive' } } } },
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
        nome: { contains: q, mode: 'insensitive' },
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

  // Sócios sem nenhum número de contato não aparecem
  const sociosFiltrados = socios.filter(s => s.whatsapp || s.telefone)

  return NextResponse.json({ clientes, socios: sociosFiltrados })
}
