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

// Contador de falhas consecutivas do IMAP (in-memory, por processo)
// Notifica admins após MAX_FALHAS_CONSECUTIVAS falhas seguidas sem sucesso
let falhasConsecutivas = 0
const MAX_FALHAS_CONSECUTIVAS = 3

export async function POST(req: Request) {
  if (!autorizarCron(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let processados = 0
  let associados  = 0
  let erros       = 0

  try {
    const emails = await buscarEmailsNovos()

    // Sync bem-sucedido — zera contador de falhas
    falhasConsecutivas = 0

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
    const mensagem = err instanceof Error ? err.message : 'Erro no IMAP'
    falhasConsecutivas++

    // Alerta admins quando IMAP falha repetidamente — evita emails acumulando sem processamento
    if (falhasConsecutivas >= MAX_FALHAS_CONSECUTIVAS) {
      try {
        const { notificarIaOffline } = await import('@/lib/notificacoes')
        // Reutiliza notificação de sistema offline com prefixo identificador
        await notificarIaOffline(
          'imap',
          `[email/sync] IMAP indisponível há ${falhasConsecutivas} tentativas consecutivas. Último erro: ${mensagem}`,
        )
      } catch {
        // Notificação falhou — log como último recurso
        console.error(`[email/sync] ALERTA: IMAP falhou ${falhasConsecutivas}x consecutivas — ${mensagem}`)
      }
    }

    return NextResponse.json({
      ok:               false,
      mensagem,
      processados:      0,
      falhasConsecutivas,
    })
  }

  return NextResponse.json({ ok: true, processados, associados, erros })
}
