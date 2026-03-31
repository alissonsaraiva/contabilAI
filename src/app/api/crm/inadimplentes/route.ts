import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hoje = new Date()

  const clientes = await prisma.cliente.findMany({
    where:   { status: 'inadimplente' },
    orderBy: { nome: 'asc' },
    select: {
      id:            true,
      nome:          true,
      planoTipo:     true,
      valorMensal:   true,
      vencimentoDia: true,
      whatsapp:      true,
      telefone:      true,
      responsavel:   { select: { nome: true } },
      empresa: {
        select: {
          razaoSocial: true,
          socios: {
            where:  { principal: true },
            select: { nome: true, whatsapp: true, telefone: true },
            take:   1,
          },
        },
      },
      cobrancasAsaas: {
        where:   { status: { in: ['PENDING', 'OVERDUE'] } },
        orderBy: { vencimento: 'asc' },
        take:    1,
        select:  {
          id: true, valor: true, vencimento: true, status: true,
          linkBoleto: true, pixCopiaECola: true,
        },
      },
      interacoes: {
        where:   { titulo: { startsWith: 'Cobrança ' } },
        orderBy: { criadoEm: 'desc' },
        take:    1,
        select:  { titulo: true, criadoEm: true },
      },
    },
  })

  const resultado = clientes.map(c => {
    const cobranca   = c.cobrancasAsaas[0] ?? null
    const socioP     = c.empresa?.socios[0] ?? null
    const diasAtraso = cobranca
      ? Math.max(0, Math.floor((hoje.getTime() - new Date(cobranca.vencimento).getTime()) / 86400000))
      : null

    return {
      id:            c.id,
      nome:          c.nome,
      planoTipo:     c.planoTipo,
      valorMensal:   Number(c.valorMensal ?? 0),
      razaoSocial:   c.empresa?.razaoSocial ?? null,
      responsavel:   c.responsavel?.nome ?? null,
      temWhatsapp:   !!(socioP?.whatsapp ?? socioP?.telefone ?? c.whatsapp ?? c.telefone),
      cobranca:      cobranca ? {
        id:            cobranca.id,
        valor:         Number(cobranca.valor),
        vencimento:    cobranca.vencimento,
        status:        cobranca.status,
        diasAtraso,
        temPix:        !!cobranca.pixCopiaECola,
        temBoleto:     !!cobranca.linkBoleto,
      } : null,
      ultimaEscalacao: c.interacoes[0] ?? null,
    }
  })

  return NextResponse.json(resultado)
}
