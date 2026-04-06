import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { buscarEmailsNovos } from '@/lib/email/imap'
import { processarEmailRecebido } from '@/lib/email/processar'
import { setImapSyncOk, setImapSyncErro, getImapSyncStatus } from '@/lib/email/imap-status'
import { hc } from '@/lib/healthchecks'

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

const MAX_FALHAS_CONSECUTIVAS = 3

export async function POST(req: Request) {
  if (!autorizarCron(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  void hc.start(process.env.HC_EMAIL_SYNC)

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
      } catch (err) {
        erros++
        // Loga contexto suficiente para debugar sem expor corpo do email
        console.error('[email/sync] falha ao processar email individual:', {
          messageId: email.messageId,
          de:        email.de,
          assunto:   email.assunto,
          err,
        })
        Sentry.captureException(err, {
          tags:  { module: 'email-sync', operation: 'processar-email' },
          extra: { messageId: email.messageId, de: email.de, assunto: email.assunto },
        })
      }
    }

    setImapSyncOk(processados, associados)
    void hc.ok(process.env.HC_EMAIL_SYNC)
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro no IMAP'
    console.error('[email/sync] Falha IMAP ao buscar emails:', mensagem, err)
    void hc.fail(process.env.HC_EMAIL_SYNC)
    Sentry.captureException(err, { tags: { module: 'email-sync', operation: 'buscar-emails' } })
    setImapSyncErro(mensagem)

    const { falhasConsecutivas } = getImapSyncStatus()
    if (falhasConsecutivas >= MAX_FALHAS_CONSECUTIVAS) {
      try {
        const { notificarIaOffline } = await import('@/lib/notificacoes')
        await notificarIaOffline(
          'imap',
          `[email/sync] IMAP indisponível há ${falhasConsecutivas} tentativas consecutivas. Último erro: ${mensagem}`,
        )
      } catch {
        console.error(`[email/sync] ALERTA: IMAP falhou ${falhasConsecutivas}x consecutivas — ${mensagem}`)
      }
    }

    return NextResponse.json({ ok: false, mensagem, processados: 0, falhasConsecutivas })
  }

  // ok=true apenas se não houve nenhum erro individual — facilita monitorar no cron
  return NextResponse.json({ ok: erros === 0, processados, associados, erros })
}

// GET — retorna status IMAP + SMTP (usado pela tela de configurações)
export async function GET(req: Request) {
  const { auth } = await import('@/lib/auth')
  const session  = await auth()
  const tipo     = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const { getSmtpStatus } = await import('@/lib/email/smtp-status')
  return NextResponse.json({ imap: getImapSyncStatus(), smtp: getSmtpStatus() })
}
