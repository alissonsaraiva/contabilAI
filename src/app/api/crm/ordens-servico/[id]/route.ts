import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolverOS } from '@/lib/services/ordens-servico'
import type { CategoriaDocumento } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const ordem   = await prisma.ordemServico.findUnique({
    where:   { id },
    include: {
      cliente: { select: { id: true, nome: true, email: true, telefone: true } },
      empresa: { select: { razaoSocial: true, nomeFantasia: true } },
    },
  })

  if (!ordem) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 })
  return NextResponse.json(ordem)
}

/**
 * PATCH /api/crm/ordens-servico/[id]
 *
 * Aceita dois formatos:
 *   1. application/json  — atualização simples de status/prioridade
 *   2. multipart/form-data — resolução completa com arquivo + canais de entrega
 *
 * Campos multipart:
 *   resposta          string
 *   categoria         CategoriaDocumento  (opcional)
 *   canal_email       "1" | "0"
 *   email_assunto     string
 *   email_corpo       string
 *   canal_whatsapp    "1" | "0"
 *   wpp_mensagem      string
 *   arquivo           File  (opcional)
 */
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const usuarioId = (session.user as any)?.id as string | undefined

  const contentType = req.headers.get('content-type') ?? ''

  // ── Resolução completa (multipart) ───────────────────────────────────────
  if (contentType.includes('multipart/form-data')) {
    const existing = await prisma.ordemServico.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 })

    const form      = await req.formData()
    const resposta  = form.get('resposta')     as string | null
    const categoria = form.get('categoria')    as CategoriaDocumento | null
    const arquivoRaw = form.get('arquivo')     as File | null

    const canalEmail     = form.get('canal_email')         === '1'
    const emailAssunto   = form.get('email_assunto')       as string | null
    const emailCorpo     = form.get('email_corpo')         as string | null
    const canalWhatsapp  = form.get('canal_whatsapp')      === '1'
    const wppMensagem    = form.get('wpp_mensagem')        as string | null
    const wppDestRaw     = form.get('wpp_destinatarios')   as string | null

    let wppDestinatariosAdicionais: Array<{ nome: string; telefone: string }> | undefined
    if (wppDestRaw) {
      try { wppDestinatariosAdicionais = JSON.parse(wppDestRaw) } catch { /* ignora parse error */ }
    }

    let arquivo: { buffer: Buffer; nome: string; mimeType: string } | undefined
    if (arquivoRaw && arquivoRaw.size > 0) {
      const arrayBuffer = await arquivoRaw.arrayBuffer()
      arquivo = {
        buffer:   Buffer.from(arrayBuffer),
        nome:     arquivoRaw.name,
        mimeType: arquivoRaw.type || 'application/octet-stream',
      }
    }

    try {
      const result = await resolverOS({
        osId:      id,
        usuarioId,
        resposta:  resposta ?? undefined,
        arquivo,
        categoria: categoria ?? undefined,
        canais: {
          email: canalEmail && emailAssunto && emailCorpo
            ? { ativo: true, assunto: emailAssunto, corpo: emailCorpo }
            : undefined,
          whatsapp: canalWhatsapp
            ? { ativo: true, mensagem: wppMensagem ?? '' }
            : undefined,
        },
        wppDestinatariosAdicionais,
      })
      return NextResponse.json(result)
    } catch (err: any) {
      return NextResponse.json({ error: err.message ?? 'Erro ao resolver OS' }, { status: 500 })
    }
  }

  // ── Atualização simples (JSON) ────────────────────────────────────────────
  const body = await req.json()

  const existing = await prisma.ordemServico.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 })

  const updateData: Record<string, unknown> = {}
  if (body.status !== undefined)     updateData.status     = body.status
  if (body.resposta !== undefined)   updateData.resposta   = body.resposta
  if (body.prioridade !== undefined) updateData.prioridade = body.prioridade

  if (body.resposta && !existing.respondidoEm) {
    updateData.respondidoEm    = new Date()
    updateData.respondidoPorId = usuarioId ?? null
  }

  if ((body.status === 'resolvida' || body.status === 'cancelada') && !existing.fechadoEm) {
    updateData.fechadoEm = new Date()
  }

  const ordem = await prisma.ordemServico.update({
    where: { id },
    data:  updateData,
  })

  return NextResponse.json(ordem)
}
