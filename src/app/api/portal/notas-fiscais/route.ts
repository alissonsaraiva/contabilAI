/**
 * GET  /api/portal/notas-fiscais — lista notas fiscais do cliente autenticado
 * POST /api/portal/notas-fiscais — emite nova NFS-e pelo cliente
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { emitirNotaFiscal } from '@/lib/services/notas-fiscais'
import { notificarEquipeNfsSolicitadaPortal } from '@/lib/services/nfse/notificacoes'
import { logger } from '@/lib/logger'
import { resolverEmpresaPrincipalDoObjeto } from '@/lib/ai/tools/resolver-empresa'

export async function GET(req: Request) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const pageSize = 20
  const mes      = searchParams.get('mes') // formato "2026-01"

  // Mostra todos os status relevantes para o cliente — incluindo enviando/processando/rejeitada
  // para que notas recém emitidas apareçam imediatamente e o cliente saiba o que está acontecendo
  const where: Record<string, unknown> = {
    clienteId,
    status: { in: ['autorizada', 'cancelada', 'enviando', 'processando', 'rejeitada', 'erro_interno'] },
  }

  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [ano, mesNum] = mes.split('-').map(Number) as [number, number]
    // Usa criadoEm (sempre preenchido) para o filtro de mês — funciona para todos os status,
    // inclusive notas rejeitadas que nunca chegaram a ter autorizadaEm
    where.criadoEm = {
      gte: new Date(ano, mesNum - 1, 1),
      lt:  new Date(ano, mesNum, 1),
    }
  }

  const [total, notas] = await Promise.all([
    prisma.notaFiscal.count({ where: where as never }),
    prisma.notaFiscal.findMany({
      where:   where as never,
      orderBy: { criadoEm: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      select: {
        id:               true,
        numero:           true,
        status:           true,
        descricao:        true,
        valorTotal:       true,
        issRetido:        true,
        issValor:         true,
        valorLiquido:     true,
        autorizadaEm:     true,
        canceladaEm:      true,
        criadoEm:         true,
        spedyId:          true,
        tomadorNome:      true,
        tomadorCpfCnpj:   true,
        tomadorEmail:     true,
        tomadorMunicipio: true,
        tomadorEstado:    true,
        protocolo:        true,
        erroMensagem:     true,
        chamado:  { select: { numero: true, titulo: true } },
      },
    }),
  ])

  return NextResponse.json({
    items: notas,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  })
}

// ─── POST — emitir NFS-e pelo portal do cliente ───────────────────────────────

export async function POST(req: Request) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  // PF não emite NFS-e
  const cliente = await prisma.cliente.findUnique({
    where:   { id: clienteId },
    select:  {
      tipoContribuinte: true,
      nome:             true,
      empresa:          { select: { spedyConfigurado: true } },
      clienteEmpresas:  {
        where:   { principal: true },
        select:  { empresa: { select: { spedyConfigurado: true } } },
        orderBy: { principal: 'desc' as const },
        take:    1,
      },
    },
  })
  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  if (cliente.tipoContribuinte === 'pf') {
    return NextResponse.json({ error: 'NFS-e não aplicável para pessoa física' }, { status: 422 })
  }
  if (!resolverEmpresaPrincipalDoObjeto(cliente)?.spedyConfigurado) {
    return NextResponse.json({ error: 'Empresa não configurada para emissão de NFS-e' }, { status: 422 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  }

  const { descricao, valor, tomadorNome, tomadorCpfCnpj, tomadorEmail, tomadorMunicipio, tomadorEstado } = body as Record<string, unknown>

  if (!descricao || typeof descricao !== 'string' || !descricao.trim()) {
    return NextResponse.json({ error: 'Descrição é obrigatória' }, { status: 400 })
  }
  if (!tomadorNome || typeof tomadorNome !== 'string' || !tomadorNome.trim()) {
    return NextResponse.json({ error: 'Nome do tomador é obrigatório' }, { status: 400 })
  }
  if (!tomadorCpfCnpj || typeof tomadorCpfCnpj !== 'string') {
    return NextResponse.json({ error: 'CPF/CNPJ do tomador é obrigatório' }, { status: 400 })
  }
  const valorNum = typeof valor === 'number' ? valor : parseFloat(String(valor ?? '').replace(',', '.'))
  if (isNaN(valorNum) || valorNum <= 0) {
    return NextResponse.json({ error: 'Valor inválido' }, { status: 400 })
  }

  try {
    const resultado = await emitirNotaFiscal({
      clienteId,
      descricao:        descricao.trim(),
      valor:            valorNum,
      tomadorNome:      String(tomadorNome).trim(),
      tomadorCpfCnpj:   String(tomadorCpfCnpj),
      tomadorEmail:     tomadorEmail     ? String(tomadorEmail).trim()     : undefined,
      tomadorMunicipio: tomadorMunicipio ? String(tomadorMunicipio).trim() : undefined,
      tomadorEstado:    tomadorEstado    ? String(tomadorEstado).trim()    : undefined,
      emitidaPorId:     undefined,
    })

    if (!resultado.sucesso) {
      return NextResponse.json({ error: resultado.detalhe }, { status: 422 })
    }

    // Marcar como originada pelo portal
    await prisma.notaFiscal.update({
      where: { id: resultado.notaFiscalId },
      data:  { solicitadaPeloPortal: true },
    })

    // Notificar equipe de forma assíncrona — não bloqueia a resposta ao cliente
    notificarEquipeNfsSolicitadaPortal(
      { id: resultado.notaFiscalId, clienteId, valorTotal: valorNum, descricao: descricao.trim() },
      cliente.nome,
    ).catch(err => logger.warn('portal-nfse-notificar-equipe-falhou', { err }))

    return NextResponse.json({ notaFiscalId: resultado.notaFiscalId, status: resultado.status }, { status: 201 })

  } catch (err) {
    logger.error('portal-nfse-emitir-falhou', { clienteId, err })
    Sentry.captureException(err, { tags: { module: 'portal-nfse', operation: 'emitir' }, extra: { clienteId } })
    return NextResponse.json({ error: 'Erro interno ao emitir nota fiscal' }, { status: 500 })
  }
}
