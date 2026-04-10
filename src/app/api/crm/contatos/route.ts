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
import { unaccentSearch } from '@/lib/search'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ clientes: [], socios: [] })

  const [clienteIds, socioIds] = await Promise.all([
    unaccentSearch({
      sql: `
        SELECT DISTINCT c.id FROM clientes c
        LEFT JOIN empresas e ON e.id = c."empresaId"
        WHERE f_unaccent(c.nome) ILIKE f_unaccent($1)
          OR f_unaccent(c.email) ILIKE f_unaccent($1)
          OR f_unaccent(e."razaoSocial") ILIKE f_unaccent($1)
      `,
      term: q,
    }),
    unaccentSearch({
      sql: `SELECT id FROM socios WHERE f_unaccent(nome) ILIKE f_unaccent($1)`,
      term: q,
    }),
  ])

  const [clientes, socios] = await Promise.all([
    prisma.cliente.findMany({
      where: { id: { in: clienteIds } },
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
      where: { id: { in: socioIds } },
      select: {
        id:       true,
        nome:     true,
        whatsapp: true,
        telefone: true,
        empresa:  { select: { razaoSocial: true, clientes: { select: { nome: true }, take: 1 } } },
      },
      take: 5,
    }),
  ])

  // Sócios sem nenhum número de contato não aparecem
  const sociosFiltrados = socios.filter(s => s.whatsapp || s.telefone)

  return NextResponse.json({ clientes, socios: sociosFiltrados })
}
