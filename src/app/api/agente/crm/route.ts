import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { executarAgente } from '@/lib/ai/agent'
// Garante que todas as tools internas estejam registradas antes de qualquer execução
import '@/lib/ai/tools'

const INSTRUCAO_MAX_LENGTH = 2000

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const body = await req.json() as {
    instrucao: string
    clienteId?: string
    leadId?: string
    toolsPermitidas?: string[]
  }

  const { instrucao, clienteId, leadId, toolsPermitidas } = body

  if (!instrucao?.trim() || instrucao.length > INSTRUCAO_MAX_LENGTH) {
    return NextResponse.json({ error: 'instrucao inválida ou muito longa' }, { status: 400 })
  }

  try {
    const resultado = await executarAgente({
      instrucao,
      contexto: {
        clienteId,
        leadId,
        solicitanteAI: 'crm',
      },
      toolsPermitidas,
    })

    return NextResponse.json(resultado)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
