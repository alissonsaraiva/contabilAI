/**
 * GET /api/usuarios/operadores
 * Retorna lista de usuários ativos para uso nos dropdowns de atribuição.
 * Apenas usuários autenticados podem consultar.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export type OperadorItem = {
  id:   string
  nome: string
  tipo: string
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const operadores = await prisma.usuario.findMany({
    where:   { ativo: true },
    select:  { id: true, nome: true, tipo: true },
    orderBy: { nome: 'asc' },
  })

  return NextResponse.json(operadores satisfies OperadorItem[])
}
