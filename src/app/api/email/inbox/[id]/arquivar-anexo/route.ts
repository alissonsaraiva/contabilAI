import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { criarDocumento } from '@/lib/services/documentos'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/email/inbox/[id]/arquivar-anexo
 *
 * Arquiva formalmente um anexo de email que o classificador de IA rejeitou.
 * O arquivo já está no S3 — apenas cria o registro Documento no banco e
 * atualiza o metadados da interação (remove de anexosRejeitados, adiciona em documentosId).
 *
 * Body: { nome: string, url: string, mimeType: string }
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  const user = session?.user as any
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  let body: { nome?: string; url?: string; mimeType?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const { nome, url, mimeType } = body
  if (!nome || !url) {
    return NextResponse.json({ error: 'Campos nome e url são obrigatórios' }, { status: 400 })
  }

  const interacao = await prisma.interacao.findFirst({
    where: { id, tipo: 'email_recebido' },
    select: { id: true, clienteId: true, leadId: true, metadados: true },
  })
  if (!interacao) return NextResponse.json({ error: 'Email não encontrado' }, { status: 404 })

  if (!interacao.clienteId && !interacao.leadId) {
    return NextResponse.json(
      { error: 'Email sem vínculo com cliente ou lead — vincule primeiro' },
      { status: 422 },
    )
  }

  // Verifica se o anexo ainda está na lista de rejeitados
  const meta = (interacao.metadados ?? {}) as Record<string, unknown>
  const rejeitados = (meta.anexosRejeitados as string[] | undefined) ?? []
  if (!rejeitados.includes(nome)) {
    return NextResponse.json({ error: 'Anexo não encontrado na lista de rejeitados' }, { status: 404 })
  }

  let documentoId: string
  try {
    const doc = await criarDocumento({
      clienteId: interacao.clienteId ?? undefined,
      leadId:    interacao.leadId    ?? undefined,
      url,
      nome,
      tipo:    'Email — Anexo',
      origem:  'email',
      metadados: {
        fonte:    'arquivar-manual',
        mimeType: mimeType ?? null,
        arquivadoPor: user.id,
      },
    })
    documentoId = doc.id
  } catch (err) {
    console.error('[email/arquivar-anexo] falha ao criar documento:', err)
    Sentry.captureException(err, {
      tags:  { module: 'email-inbox', operation: 'arquivar-anexo' },
      extra: { interacaoId: id, nome, url },
    })
    return NextResponse.json({ error: 'Falha ao arquivar. Tente novamente.' }, { status: 502 })
  }

  // Atualiza metadados: remove de anexosRejeitados, adiciona em documentosId
  const documentosId = [...((meta.documentosId as string[] | undefined) ?? []), documentoId]
  const novosMeta = {
    ...meta,
    documentosId,
    anexosRejeitados: rejeitados.filter(n => n !== nome),
  }

  try {
    await prisma.interacao.update({
      where: { id },
      data:  { metadados: novosMeta },
    })
  } catch (err) {
    console.error('[email/arquivar-anexo] falha ao atualizar metadados da interacao:', err)
    Sentry.captureException(err, {
      tags:  { module: 'email-inbox', operation: 'arquivar-anexo-update-meta' },
      extra: { interacaoId: id, documentoId },
    })
    // Documento foi criado — retorna sucesso mesmo assim (metadados é cosmético)
  }

  const clienteLink = interacao.clienteId
    ? `/crm/clientes/${interacao.clienteId}`
    : `/crm/leads/${interacao.leadId}`

  return NextResponse.json({ ok: true, documentoId, clienteLink }, { status: 201 })
}
