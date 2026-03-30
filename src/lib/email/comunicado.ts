/**
 * Envio em massa de comunicados por e-mail.
 * Chamado de forma fire-and-forget — não bloqueia a resposta da API.
 * Só envia uma vez por comunicado (guarda emailEnviadoEm).
 */

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

  // Busca clientes nos status selecionados com e-mail cadastrado
  const clientes = await prisma.cliente.findMany({
    where: {
      status: { in: statusFiltro },
      email:  { not: undefined },
    },
    select: { id: true, nome: true, email: true },
  })

  for (const cliente of clientes) {
    if (!cliente.email) continue
    try {
      await sendEmail({
        para:    cliente.email,
        assunto: comunicado.titulo,
        corpo:   htmlCorpo,
        anexos,
      })
    } catch {
      // Falha individual não interrompe os outros
    }
    await sleep(DELAY_MS)
  }
}
