import { NextResponse } from 'next/server'
import { buscarEmailsNovos } from '@/lib/email/imap'
import { processarEmailRecebido } from '@/lib/email/processar'

// Proteção por secret para chamadas do cron interno
function autorizarCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[email/sync] CRON_SECRET não configurado em produção — requisição bloqueada')
      return false
    }
    return true // dev sem secret — permite
  }
  const authHeader = req.headers.get('authorization')
  return authHeader === `Bearer ${secret}`
}

export async function POST(req: Request) {
  if (!autorizarCron(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let processados = 0
  let associados  = 0
  let erros       = 0

  try {
    const emails = await buscarEmailsNovos()

    for (const email of emails) {
      try {
        const resultado = await processarEmailRecebido(email)
        processados++
        if (resultado.associado) associados++
      } catch {
        erros++
      }
    }
  } catch (err) {
    // IMAP indisponível ou não configurado — retorna silenciosamente
    return NextResponse.json({
      ok:          false,
      mensagem:    err instanceof Error ? err.message : 'Erro no IMAP',
      processados: 0,
    })
  }

  return NextResponse.json({ ok: true, processados, associados, erros })
}
