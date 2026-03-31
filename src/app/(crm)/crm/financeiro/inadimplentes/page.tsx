import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { InadimplentesClient } from '@/components/crm/inadimplentes-client'

export const metadata = { title: 'Inadimplentes' }

export default async function InadimplentesPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const hoje = new Date()

  const clientes = await prisma.cliente.findMany({
    where:   { status: 'inadimplente' },
    orderBy: { nome: 'asc' },
    select: {
      id:            true,
      nome:          true,
      planoTipo:     true,
      valorMensal:   true,
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
        select:  { id: true, valor: true, vencimento: true, status: true },
      },
      interacoes: {
        where:   { titulo: { startsWith: 'Cobrança ' } },
        orderBy: { criadoEm: 'desc' },
        take:    1,
        select:  { titulo: true, criadoEm: true },
      },
      whatsapp: true,
      telefone: true,
    },
  })

  const rows = clientes.map(c => {
    const cobranca   = c.cobrancasAsaas[0] ?? null
    const socioP     = c.empresa?.socios[0] ?? null
    const diasAtraso = cobranca
      ? Math.max(0, Math.floor((hoje.getTime() - new Date(cobranca.vencimento).getTime()) / 86400000))
      : null

    return {
      id:          c.id,
      nome:        c.empresa?.razaoSocial ?? c.nome,
      nomeCliente: c.nome,
      planoTipo:   c.planoTipo,
      valorMensal: Number(c.valorMensal ?? 0),
      responsavel: c.responsavel?.nome ?? null,
      temWhatsapp: !!(socioP?.whatsapp ?? socioP?.telefone ?? c.whatsapp ?? c.telefone),
      cobranca:    cobranca ? {
        id:        cobranca.id,
        valor:     Number(cobranca.valor),
        vencimento: cobranca.vencimento.toISOString(),
        diasAtraso,
      } : null,
      ultimaEscalacao: c.interacoes[0]?.titulo
        ? { titulo: c.interacoes[0].titulo, criadoEm: c.interacoes[0].criadoEm.toISOString() }
        : null,
    }
  })

  const totalEmAberto = rows.reduce((s, r) => s + (r.cobranca?.valor ?? 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inadimplentes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Clientes com cobranças em atraso — gerencie contatos e envie cobranças.
        </p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total</p>
          <p className="text-3xl font-bold mt-1">{rows.length}</p>
          <p className="text-xs text-muted-foreground mt-1">clientes inadimplentes</p>
        </div>
        <div className="rounded-xl border bg-destructive/10 border-destructive/20 p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Em aberto</p>
          <p className="text-3xl font-bold mt-1 text-destructive">
            {totalEmAberto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">valor estimado</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Com WhatsApp</p>
          <p className="text-3xl font-bold mt-1">{rows.filter(r => r.temWhatsapp).length}</p>
          <p className="text-xs text-muted-foreground mt-1">podem receber mensagem</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">+15 dias</p>
          <p className="text-3xl font-bold mt-1 text-orange-500">
            {rows.filter(r => (r.cobranca?.diasAtraso ?? 0) >= 15).length}
          </p>
          <p className="text-xs text-muted-foreground mt-1">em atraso crítico</p>
        </div>
      </div>

      <InadimplentesClient rows={rows} />
    </div>
  )
}
