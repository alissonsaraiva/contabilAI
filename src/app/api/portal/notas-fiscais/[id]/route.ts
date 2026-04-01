/**
 * GET /api/portal/notas-fiscais/[id] — detalhe de uma nota fiscal do cliente autenticado
 * (inclui URL de PDF para download)
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  const { id } = await params

  const nota = await prisma.notaFiscal.findUnique({
    where: { id },
    select: {
      id:             true,
      clienteId:      true,
      numero:         true,
      descricao:      true,
      valorTotal:     true,
      issRetido:      true,
      issValor:       true,
      valorLiquido:   true,
      autorizadaEm:   true,
      status:         true,
      spedyId:        true,
      tomadorNome:    true,
      tomadorCpfCnpj: true,
      protocolo:      true,
      ordemServico:   { select: { numero: true, titulo: true } },
    },
  })

  if (!nota) return NextResponse.json({ error: 'Nota fiscal não encontrada' }, { status: 404 })

  if (nota.clienteId !== clienteId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const pdfUrl = nota.spedyId ? `/api/portal/notas-fiscais/${id}/pdf` : null

  return NextResponse.json({ ...nota, pdfUrl })
}
