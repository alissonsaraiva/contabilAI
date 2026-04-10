import { auth } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { PortalDocumentosUpload } from '@/components/portal/portal-documentos-upload'
import { PortalDocumentosClient } from './portal-documentos-client'

type Props = { searchParams: Promise<Record<string, string>> }

const DOC_SELECT = {
  id: true, nome: true, tipo: true, categoria: true,
  origem: true, url: true, mimeType: true, tamanho: true,
  status: true, criadoEm: true, xmlMetadata: true,
  visualizadoEm: true, dataVencimento: true,
} as const

export default async function PortalDocumentosPage({ searchParams }: Props) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) redirect('/portal/login')

  const clienteId = await resolveClienteId(user)
  if (!clienteId) redirect('/portal/login')

  const empresaId = user.empresaId as string | undefined

  const baseWhere: any = empresaId
    ? { OR: [{ clienteId }, { empresaId }], deletadoEm: null, visivelPortal: true }
    : { clienteId, deletadoEm: null, visivelPortal: true }

  const documentos = await prisma.documento.findMany({
    where:   baseWhere,
    orderBy: { criadoEm: 'desc' },
    select:  DOC_SELECT,
  })

  // Stats por categoria
  const contagens = await prisma.documento.groupBy({
    by:    ['categoria'],
    where: baseWhere,
    _count: { id: true },
  })
  const contagemMap = Object.fromEntries(contagens.map(c => [c.categoria, c._count.id]))
  const totalGeral  = contagens.reduce((acc, c) => acc + c._count.id, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-semibold text-on-surface">Documentos</h1>
        <p className="text-sm text-on-surface-variant/70 mt-1">
          Documentos enviados pelo escritório e arquivos que você enviou.
        </p>
      </div>

      <PortalDocumentosUpload />

      <PortalDocumentosClient
        documentos={documentos.map(d => ({
          ...d,
          criadoEm:       d.criadoEm.toISOString(),
          visualizadoEm:  d.visualizadoEm?.toISOString() ?? null,
          dataVencimento: d.dataVencimento?.toISOString() ?? null,
          tamanho:        d.tamanho != null ? Number(d.tamanho) : null,
          xmlMetadata:    d.xmlMetadata as unknown,
        }))}
        contagemMap={contagemMap}
        totalGeral={totalGeral}
      />
    </div>
  )
}
