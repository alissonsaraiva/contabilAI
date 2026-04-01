/**
 * GET /api/crm/notas-fiscais/[id] — detalhe de uma nota fiscal
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const nota = await prisma.notaFiscal.findUnique({
    where:   { id },
    include: {
      cliente:      { select: { nome: true, email: true, cidade: true, uf: true } },
      empresa:      { select: { razaoSocial: true, nomeFantasia: true, cnpj: true } },
      ordemServico: { select: { numero: true, titulo: true } },
    },
  })

  if (!nota) return NextResponse.json({ error: 'Nota fiscal não encontrada' }, { status: 404 })

  return NextResponse.json(nota)
}
