import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { criarDocumento } from '@/lib/services/documentos'
import { resolveClienteId } from '@/lib/portal-session'
import { notificarDocumentoEnviado } from '@/lib/notificacoes'
import { classificarDocumento, buildContextoPortal } from '@/lib/services/classificar-documento'
import type { CategoriaDocumento } from '@prisma/client'

export async function POST(req: Request) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  // empresaId disponível na sessão para clientes PJ
  const empresaId = user.empresaId as string | undefined

  const formData = await req.formData()
  const file     = formData.get('file')      as File | null
  const tipo     = (formData.get('tipo')     as string) || 'outros'
  const categoria = formData.get('categoria') as CategoriaDocumento | null

  if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

  const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Arquivo muito grande. O limite é 10 MB.' }, { status: 413 })
  }

  // Bloqueia extensões executáveis / scripts por nome de arquivo
  const EXTENSOES_BLOQUEADAS = /\.(exe|bat|cmd|sh|ps1|msi|dll|so|js|mjs|ts|py|rb|php|pl|jar|vbs|wsf|hta)$/i
  if (EXTENSOES_BLOQUEADAS.test(file.name)) {
    return NextResponse.json({ error: 'Tipo de arquivo não permitido.' }, { status: 415 })
  }

  const bytes  = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Classifica se o arquivo é um documento formal antes de arquivar
  const contexto = await buildContextoPortal(clienteId, 5)
  const deveArquivar = await classificarDocumento({
    arquivo: { nome: file.name, mimeType: file.type || 'application/octet-stream', buffer },
    contexto,
  }).catch(() => true)  // em caso de erro, arquiva por segurança

  if (!deveArquivar) {
    return NextResponse.json(
      { error: 'O arquivo enviado não parece ser um documento formal. Por favor, envie um documento válido (nota fiscal, boleto, contrato, etc.).' },
      { status: 422 },
    )
  }

  let documento: Awaited<ReturnType<typeof criarDocumento>>
  try {
    documento = await criarDocumento({
      clienteId,
      empresaId: empresaId || undefined,
      arquivo: {
        buffer,
        nome:     file.name,
        mimeType: file.type || 'application/octet-stream',
      },
      tipo,
      categoria:  categoria ?? undefined,
      status:     'pendente',
      origem:     'portal',
    })
  } catch (err) {
    console.error('[portal/documentos/upload] falha ao salvar documento:', err)
    Sentry.captureException(err, { tags: { module: 'portal-documentos-upload', operation: 'criarDocumento' }, extra: { clienteId } })
    return NextResponse.json({ error: 'Falha ao enviar o documento. Tente novamente.' }, { status: 502 })
  }

  notificarDocumentoEnviado({ clienteId, nomeArquivo: file.name }).catch((err: unknown) =>
    console.error('[portal/documentos/upload] erro ao notificar documento_enviado:', { clienteId, err }),
  )

  return NextResponse.json(documento)
}
