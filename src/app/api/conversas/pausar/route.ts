import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { registrarHumanoAssumiu } from '@/lib/historico'
import { indexarAsync } from '@/lib/rag/indexar-async'

export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as any
  if (!session || (user?.tipo !== 'admin' && user?.tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { conversaId } = await req.json() as { conversaId: string }
  if (!conversaId) return NextResponse.json({ error: 'conversaId obrigatório' }, { status: 400 })

  const pausadaEm = new Date()

  const conversa = await prisma.conversaIA.update({
    where: { id: conversaId },
    data:  { pausadaEm, pausadoPorId: user.id ?? null },
    select: { clienteId: true, leadId: true, canal: true },
  })

  registrarHumanoAssumiu({
    conversaId,
    operadorId:   user.id,
    operadorNome: user.name ?? 'Operador',
    clienteId:    conversa.clienteId ?? undefined,
    leadId:       conversa.leadId    ?? undefined,
  })

  // Indexa o histórico da conversa no RAG — fire-and-forget
  // Permite que a IA responda "o que discutimos na última conversa?" em sessões futuras
  prisma.mensagemIA.findMany({
    where:   { conversaId },
    orderBy: { criadaEm: 'desc' },
    take:    20,
    select:  { role: true, conteudo: true, criadaEm: true },
  }).then(msgs => {
    if (msgs.length > 0) {
      indexarAsync('conversa', {
        id:        conversaId,
        canal:     conversa.canal,
        clienteId: conversa.clienteId ?? null,
        leadId:    conversa.leadId    ?? null,
        mensagens: msgs.reverse(),
        pausadaEm,
      })
    }
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
