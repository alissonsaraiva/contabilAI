/**
 * API de configuração do Integra Contador (SERPRO).
 *
 * GET  — retorna config com campos sensíveis mascarados
 * PUT  — salva config, encriptando os campos secretos
 * POST — testa a conexão OAuth e retorna status + token parcial
 *
 * Campos encriptados: integraContadorClientSecret, integraContadorCertBase64, integraContadorCertSenha
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { encrypt, maskKey } from '@/lib/crypto'
import { indexarAsync } from '@/lib/rag/indexar-async'
import * as Sentry from '@sentry/nextjs'

const SECRET_FIELDS = [
  'integraContadorClientSecret',
  'integraContadorCertBase64',
  'integraContadorCertSenha',
] as const

type SecretField = (typeof SECRET_FIELDS)[number]

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth()
  const tipo    = (session?.user as any)?.tipo
  if (!session || tipo !== 'admin') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const row = await prisma.escritorio.findFirst({
      select: {
        integraContadorClientId:     true,
        integraContadorClientSecret: true,
        integraContadorAmbiente:     true,
        integraContadorCertBase64:   true,
        integraContadorCertSenha:    true,
        integraContadorEnabled:      true,
        integraContadorModulos:      true,
        dasMeiVencimentoDia:         true,
        dasMeiDiasAntecedencia:      true,
        dasMeiCanalEmail:            true,
        dasMeiCanalWhatsapp:         true,
        dasMeiCanalPwa:              true,
      },
    })

    const result: Record<string, unknown> = {
      integraContadorClientId:  row?.integraContadorClientId  ?? null,
      integraContadorAmbiente:  row?.integraContadorAmbiente  ?? 'homologacao',
      integraContadorEnabled:   row?.integraContadorEnabled   ?? false,
      integraContadorModulos:   row?.integraContadorModulos   ?? '[]',
      dasMeiVencimentoDia:      row?.dasMeiVencimentoDia      ?? 20,
      dasMeiDiasAntecedencia:   row?.dasMeiDiasAntecedencia   ?? 5,
      dasMeiCanalEmail:         row?.dasMeiCanalEmail         ?? true,
      dasMeiCanalWhatsapp:      row?.dasMeiCanalWhatsapp      ?? true,
      dasMeiCanalPwa:           row?.dasMeiCanalPwa           ?? true,
    }

    // Campos secretos: retorna máscara + flag "configurado"
    for (const field of SECRET_FIELDS) {
      const val = row?.[field as keyof typeof row] as string | null | undefined
      result[field]                  = val ? maskKey(val) : null
      result[`${field}Configured`]   = !!val
    }

    return NextResponse.json(result)
  } catch (err) {
    Sentry.captureException(err, {
      tags: { module: 'integra-contador', operation: 'GET-config' },
    })
    return NextResponse.json({ error: 'Erro ao buscar configuração' }, { status: 500 })
  }
}

// ─── PUT ──────────────────────────────────────────────────────────────────────

export async function PUT(req: Request) {
  const session = await auth()
  const tipo    = (session?.user as any)?.tipo
  if (!session || tipo !== 'admin') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json() as Record<string, unknown>
    const data: Record<string, unknown> = {}

    // Campos plain
    const plainFields: (keyof typeof body)[] = [
      'integraContadorClientId',
      'integraContadorAmbiente',
      'integraContadorEnabled',
      'integraContadorModulos',
      'dasMeiVencimentoDia',
      'dasMeiDiasAntecedencia',
      'dasMeiCanalEmail',
      'dasMeiCanalWhatsapp',
      'dasMeiCanalPwa',
    ]
    for (const field of plainFields) {
      if (field in body) data[field] = body[field] ?? null
    }

    // Campos secretos — só encripta se o valor mudou (não é máscara)
    for (const field of SECRET_FIELDS) {
      if (!(field in body)) continue
      const val = body[field]
      if (!val || typeof val !== 'string') continue
      // Valor começa com "•" = usuário não alterou, mantém o que está no banco
      if (val.startsWith('•')) continue

      if (!process.env.ENCRYPTION_KEY) {
        console.warn(`[integra-contador] ENCRYPTION_KEY não configurada — salvando ${field} sem encriptação`)
        data[field] = val
      } else {
        data[field] = encrypt(val)
      }
    }

    await prisma.escritorio.upsert({
      where:  { id: 'singleton' },
      update: { ...data, atualizadoEm: new Date() },
      create: { id: 'singleton', ...data },
    })

    // Invalida o cache de token para forçar re-autenticação com as novas credenciais
    try {
      const { clearTokenCache } = await import('@/lib/services/integra-contador')
      clearTokenCache()
    } catch {
      // não crítico — cache expira naturalmente
    }

    // Reindexação em background: escritório com nova capacidade disponível
    prisma.escritorio.findFirst({
      select: { nome: true, nomeFantasia: true, cnpj: true },
    }).then(esc => {
      if (esc) indexarAsync('escritorio', esc)
    }).catch(err => console.error('[integra-contador/PUT] falha na reindexação:', err))

    return NextResponse.json({ ok: true })
  } catch (err) {
    Sentry.captureException(err, {
      tags: { module: 'integra-contador', operation: 'PUT-config' },
    })
    return NextResponse.json({ error: 'Erro ao salvar configuração' }, { status: 500 })
  }
}

// ─── POST — teste de conexão ──────────────────────────────────────────────────

export async function POST() {
  const session = await auth()
  const tipo    = (session?.user as any)?.tipo
  if (!session || tipo !== 'admin') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const { getIntegraContadorConfig, getAccessToken, clearTokenCache } =
      await import('@/lib/services/integra-contador')

    // Força nova autenticação para validar as credenciais salvas
    clearTokenCache()

    const config = await getIntegraContadorConfig()
    if (!config) {
      return NextResponse.json({
        ok:   false,
        erro: 'Integração não configurada ou desabilitada. Preencha as credenciais e habilite a integração antes de testar.',
      })
    }

    const token = await getAccessToken(config)

    return NextResponse.json({
      ok:      true,
      label:   `Autenticado com sucesso — ambiente: ${config.ambiente}`,
      preview: `${token.slice(0, 20)}...`,
      modulos: config.modulos,
      cert:    config.certBase64 ? 'Certificado configurado' : 'Sem certificado (opcional)',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    Sentry.captureException(err, {
      tags: { module: 'integra-contador', operation: 'test-connection' },
    })
    return NextResponse.json({ ok: false, erro: msg })
  }
}
