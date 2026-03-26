import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAiHealth } from '@/lib/ai/health-cache'

export async function GET() {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  return NextResponse.json(getAiHealth())
}
