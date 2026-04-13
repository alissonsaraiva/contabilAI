/**
 * Envio em massa de comunicados por e-mail.
 * Chamado de forma fire-and-forget — não bloqueia a resposta da API.
 * Só envia uma vez por comunicado (guarda emailEnviadoEm).
 * Rastreia sucesso/falha por destinatário via ComunicadoEnvio.
 */

import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { sendEmail } from './send'
import { wrapEmailHtml } from './template'
import type { StatusCliente } from '@prisma/client'

const DELAY_MS = 80  // pausa entre envios para não sobrecarregar SMTP/Resend

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function enviarComunicadoPorEmail(
  comunicadoId: string,
  statusFiltro: StatusCliente[] = ['ativo', 'inadimplente'],
): Promise<void> {
  // Busca o comunicado — verifica se ainda não foi enviado por email
  const comunicado = await prisma.comunicado.findUnique({
    where:  { id: comunicadoId },
    select: { id: true, titulo: true, conteudo: true, publicado: true, emailEnviadoEm: true, anexoUrl: true, anexoNome: true },
  })

  if (!comunicado || !comunicado.publicado || comunicado.emailEnviadoEm) return

  // Marca como enviado antes de disparar — evita double-send mesmo se chamada duas vezes
  await prisma.comunicado.update({
    where: { id: comunicadoId },
    data:  { emailEnviadoEm: new Date() },
  })

  // Busca escritório para personalizar template
  const escritorio = await prisma.escritorio.findFirst({
    select: { nome: true },
  })
  const nomeEscritorio = escritorio?.nome ?? 'Escritório de Contabilidade'

  // Monta corpo com link para o anexo (se houver)
  const corpoComAnexo = comunicado.conteudo + (
    comunicado.anexoUrl
      ? `\n\n📎 <a href="${comunicado.anexoUrl}" style="color:#0C2240;font-weight:600;" target="_blank">${comunicado.anexoNome ?? 'Baixar anexo'}</a>`
      : ''
  )

  const htmlCorpo = wrapEmailHtml(corpoComAnexo, {
    nomeEscritorio,
    assunto: comunicado.titulo,
  })

  // Prepara anexo para SMTP (Resend recebe só o link no corpo)
  const anexos = comunicado.anexoUrl && comunicado.anexoNome
    ? [{ nome: comunicado.anexoNome, url: comunicado.anexoUrl }]
    : []

  // Busca clientes nos status selecionados
  // email é campo obrigatório (String @unique) — não precisa filtrar por null
  const clientes = await prisma.cliente.findMany({
    where: { status: { in: statusFiltro } },
    select: { id: true, nome: true, email: true },
  })

  let enviados = 0
  let falhas   = 0

  for (const cliente of clientes) {
    if (!cliente.email) continue
    try {
      const result = await sendEmail({
        para:    cliente.email,
        assunto: comunicado.titulo,
        corpo:   htmlCorpo,
        anexos,
      })

      if (result.ok) {
        enviados++
        await prisma.comunicadoEnvio.upsert({
          where:  { comunicadoId_clienteId: { comunicadoId: comunicado.id, clienteId: cliente.id } },
          create: { id: crypto.randomUUID(), comunicadoId: comunicado.id, clienteId: cliente.id, email: cliente.email, status: 'enviado', enviadoEm: new Date() },
          update: { status: 'enviado', enviadoEm: new Date(), erro: null },
        })
      } else {
        falhas++
        await prisma.comunicadoEnvio.upsert({
          where:  { comunicadoId_clienteId: { comunicadoId: comunicado.id, clienteId: cliente.id } },
          create: { id: crypto.randomUUID(), comunicadoId: comunicado.id, clienteId: cliente.id, email: cliente.email, status: 'falhou', erro: result.erro },
          update: { status: 'falhou', erro: result.erro },
        })
        console.error('[comunicado] falha ao enviar email para cliente:', { clienteId: cliente.id, email: cliente.email, erro: result.erro })
      }
    } catch (err) {
      falhas++
      console.error('[comunicado] exceção ao enviar email para cliente:', { clienteId: cliente.id, email: cliente.email, err })
      Sentry.captureException(err, {
        tags:  { module: 'email-comunicado', operation: 'enviar-cliente' },
        extra: { clienteId: cliente.id, comunicadoId: comunicado.id, email: cliente.email },
      })
      // Registra falha individual para visibilidade e retry futuro
      try {
        await prisma.comunicadoEnvio.upsert({
          where:  { comunicadoId_clienteId: { comunicadoId: comunicado.id, clienteId: cliente.id } },
          create: { id: crypto.randomUUID(), comunicadoId: comunicado.id, clienteId: cliente.id, email: cliente.email, status: 'falhou', erro: err instanceof Error ? err.message : String(err) },
          update: { status: 'falhou', erro: err instanceof Error ? err.message : String(err) },
        })
      } catch (err) {
        console.error('[email/comunicado] falha ao salvar status de envio:', err)
        // Não propaga — manter loop rodando para os demais clientes
      }
    }
    await sleep(DELAY_MS)
  }

  if (falhas > 0) {
    console.warn(`[comunicado] envio concluído com falhas: ${enviados} enviados, ${falhas} falhas — comunicadoId=${comunicado.id}`)
    Sentry.captureMessage(`Comunicado enviado com falhas parciais: ${falhas}/${clientes.length}`, {
      level: 'warning',
      tags:  { module: 'email-comunicado', operation: 'envio-massa' },
      extra: { comunicadoId: comunicado.id, enviados, falhas, total: clientes.length },
    })
  } else {
    console.log(`[comunicado] envio concluído com sucesso: ${enviados}/${clientes.length} destinatários — comunicadoId=${comunicado.id}`)
  }
}
