/**
 * GET  /api/portal/procuracao-rf
 *   Retorna o status de procuração RF do cliente logado.
 *
 * POST /api/portal/procuracao-rf
 *   Aciona verificação imediata via SERPRO (throttle: 1x/10 min).
 *   Se o módulo integra-procuracoes não estiver contratado, retorna o valor atual do banco
 *   com uma mensagem explicativa (degradação graciosa).
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { getIntegraContadorConfig, consultarProcuracao } from '@/lib/services/integra-contador'
import { indexarAsync } from '@/lib/rag/indexar-async'

const THROTTLE_MINUTOS = 10

async function getEmpresa(clienteId: string) {
  return prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: {
      empresa: {
        select: {
          id:                       true,
          regime:                   true,
          cnpj:                     true,
          procuracaoRFAtiva:        true,
          procuracaoRFVerificadaEm: true,
        },
      },
    },
  })
}

export async function GET() {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 400 })

  const row = await getEmpresa(clienteId)
  const empresa = row?.empresa

  if (!empresa) {
    return NextResponse.json({ regime: null, procuracaoRFAtiva: false, verificadaEm: null })
  }

  return NextResponse.json({
    regime:            empresa.regime,
    procuracaoRFAtiva: empresa.procuracaoRFAtiva,
    verificadaEm:      empresa.procuracaoRFVerificadaEm?.toISOString() ?? null,
  })
}

export async function POST() {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 400 })

  const row = await getEmpresa(clienteId)
  const empresa = row?.empresa

  if (!empresa) {
    return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })
  }

  if (empresa.regime !== 'MEI') {
    return NextResponse.json({ error: 'Não aplicável para este regime.' }, { status: 400 })
  }

  if (!empresa.cnpj) {
    return NextResponse.json({ error: 'CNPJ não cadastrado.' }, { status: 400 })
  }

  // Throttle: não verifica mais de 1x a cada THROTTLE_MINUTOS
  if (empresa.procuracaoRFVerificadaEm) {
    const diffMs   = Date.now() - new Date(empresa.procuracaoRFVerificadaEm).getTime()
    const diffMins = diffMs / 1_000 / 60
    if (diffMins < THROTTLE_MINUTOS) {
      return NextResponse.json({
        procuracaoRFAtiva: empresa.procuracaoRFAtiva,
        verificadaEm:      empresa.procuracaoRFVerificadaEm.toISOString(),
        mensagem:          'Verificação recente — aguarde alguns minutos para verificar novamente.',
        throttled:         true,
      })
    }
  }

  try {
    const config = await getIntegraContadorConfig()

    // Módulo não contratado: retorna estado atual sem chamar SERPRO
    if (!config || !config.modulos.includes('integra-procuracoes')) {
      return NextResponse.json({
        procuracaoRFAtiva: empresa.procuracaoRFAtiva,
        verificadaEm:      empresa.procuracaoRFVerificadaEm?.toISOString() ?? null,
        mensagem:          'Verificação automática em andamento. Confirmaremos em breve.',
        automatica:        true,
      })
    }

    const escritorio = await prisma.escritorio.findFirst({ select: { cnpj: true } })
    if (!escritorio?.cnpj) {
      return NextResponse.json({
        procuracaoRFAtiva: empresa.procuracaoRFAtiva,
        verificadaEm:      empresa.procuracaoRFVerificadaEm?.toISOString() ?? null,
        mensagem:          'Verificação automática em andamento. Confirmaremos em breve.',
        automatica:        true,
      })
    }

    const cnpjCliente   = empresa.cnpj.replace(/[.\-/\s]/g, '')
    const cnpjEscritorio = escritorio.cnpj.replace(/[.\-/\s]/g, '')

    const resultado = await consultarProcuracao(cnpjCliente, cnpjEscritorio)
    const ativa     = resultado.status === 'ativa'
    const agora     = new Date()

    await prisma.empresa.update({
      where: { id: empresa.id },
      data: {
        procuracaoRFAtiva:       ativa,
        procuracaoRFVerificadaEm: agora,
      },
    })

    // Re-indexa no RAG para que as IAs reflitam o novo status
    indexarAsync('empresa', {
      id:                       empresa.id,
      clienteId,
      cnpj:                     empresa.cnpj,
      regime:                   'MEI',
      procuracaoRFAtiva:        ativa,
      procuracaoRFVerificadaEm: agora,
    })

    return NextResponse.json({
      procuracaoRFAtiva: ativa,
      verificadaEm:      new Date().toISOString(),
      mensagem:          ativa
        ? 'Procuração ativa! Seus dados foram confirmados na Receita Federal.'
        : 'Procuração ainda não encontrada na Receita Federal. Verifique as instruções abaixo.',
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    Sentry.captureException(err, {
      tags:  { module: 'portal-procuracao-rf', operation: 'verificar' },
      extra: { clienteId },
    })
    return NextResponse.json({
      procuracaoRFAtiva: empresa.procuracaoRFAtiva,
      verificadaEm:      empresa.procuracaoRFVerificadaEm?.toISOString() ?? null,
      mensagem:          'Não foi possível verificar agora. Tente novamente em alguns minutos.',
      erro:              msg,
    }, { status: 500 })
  }
}
