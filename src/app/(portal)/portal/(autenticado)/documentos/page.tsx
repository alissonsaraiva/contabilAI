import { auth } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { Card } from '@/components/ui/card'
import { PortalDocumentosUpload } from '@/components/portal/portal-documentos-upload'

const PER_PAGE = 30

type Props = { searchParams: Promise<{ page?: string; tipo?: string }> }

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pendente:  { label: 'Pendente',  color: 'text-yellow-600 bg-yellow-500/10' },
  enviado:   { label: 'Enviado',   color: 'text-blue-600 bg-blue-500/10' },
  aprovado:  { label: 'Aprovado',  color: 'text-green-status bg-green-status/10' },
  rejeitado: { label: 'Rejeitado', color: 'text-error bg-error/10' },
}

const MIME_ICON: Record<string, string> = {
  'application/pdf':  'picture_as_pdf',
  'image/jpeg':       'image',
  'image/png':        'image',
  'text/xml':         'code',
  'application/xml':  'code',
}

function getIcon(mime: string | null, nome: string) {
  if (!mime) return nome.endsWith('.xml') ? 'code' : 'description'
  return MIME_ICON[mime] ?? 'description'
}

function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default async function PortalDocumentosPage({ searchParams }: Props) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) redirect('/portal/login')

  const clienteId = await resolveClienteId(user)
  if (!clienteId) redirect('/portal/login')

  const sp   = await searchParams
  const page = Math.max(1, parseInt(sp.page ?? '1'))
  const skip = (page - 1) * PER_PAGE
  const tipoFilter = sp.tipo

  const where: any = { clienteId }
  if (tipoFilter) where.tipo = tipoFilter

  const [documentos, total] = await Promise.all([
    prisma.documento.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip,
      take:    PER_PAGE,
    }),
    prisma.documento.count({ where }),
  ])

  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-on-surface">Documentos</h1>
          <p className="text-sm text-on-surface-variant/70 mt-1">
            Documentos enviados pelo escritório e arquivos que você enviou.
          </p>
        </div>
        {total > 0 && (
          <span className="shrink-0 text-sm text-on-surface-variant mt-1">
            {total} documento{total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Upload */}
      <PortalDocumentosUpload />

      {/* Filtros por tipo */}
      {total > 0 && (
        <div className="flex flex-wrap gap-2">
          {[undefined, 'NFe', 'NFC-e', 'CT-e', 'NFS-e', 'contrato', 'outros'].map(t => (
            <a
              key={t ?? 'todos'}
              href={t ? `?tipo=${t}` : '/portal/documentos'}
              className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                tipoFilter === t || (!tipoFilter && !t)
                  ? 'bg-primary text-white'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {t ?? 'Todos'}
            </a>
          ))}
        </div>
      )}

      {documentos.length === 0 ? (
        <Card className="border-outline-variant/15 bg-card/60 p-10 rounded-[16px] shadow-sm flex flex-col items-center gap-3 text-center">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant/25">folder_open</span>
          <p className="text-[14px] font-medium text-on-surface-variant/60">Nenhum documento encontrado.</p>
        </Card>
      ) : (
        <Card className="border-outline-variant/15 bg-card/60 rounded-[16px] shadow-sm overflow-hidden">
          <ul className="divide-y divide-outline-variant/10">
            {documentos.map(d => {
              const s    = STATUS_LABEL[d.status] ?? { label: d.status, color: 'text-on-surface-variant bg-surface-container' }
              const icon = getIcon(d.mimeType, d.nome)
              const isXML = d.mimeType?.includes('xml') || d.nome.toLowerCase().endsWith('.xml')
              const xmlMeta = d.xmlMetadata as any
              return (
                <li key={d.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span
                    className={`material-symbols-outlined mt-0.5 text-[20px] shrink-0 ${isXML ? 'text-primary' : 'text-on-surface-variant/50'}`}
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-on-surface truncate">{d.nome}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                      <span className="text-[11px] text-on-surface-variant/60">
                        {d.tipo} · {new Date(d.criadoEm).toLocaleDateString('pt-BR')}
                        {d.tamanho ? ` · ${formatSize(d.tamanho)}` : ''}
                      </span>
                      {d.origemPortal && (
                        <span className="text-[10px] font-semibold text-primary/70">↑ enviado por você</span>
                      )}
                    </div>
                    {/* XML metadata preview */}
                    {isXML && xmlMeta && xmlMeta.tipo !== 'desconhecido' && (
                      <div className="mt-1.5 rounded-lg bg-primary/5 px-3 py-2 text-[11px] text-on-surface-variant/80 space-y-0.5">
                        {xmlMeta.emitenteNome && <p><span className="font-semibold">Emitente:</span> {xmlMeta.emitenteNome}</p>}
                        {xmlMeta.destinatarioNome && <p><span className="font-semibold">Destinatário:</span> {xmlMeta.destinatarioNome}</p>}
                        {xmlMeta.valorTotal && <p><span className="font-semibold">Valor:</span> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(xmlMeta.valorTotal)}</p>}
                        {xmlMeta.dataEmissao && <p><span className="font-semibold">Emissão:</span> {new Date(xmlMeta.dataEmissao).toLocaleDateString('pt-BR')}</p>}
                        {xmlMeta.numero && <p><span className="font-semibold">Nº:</span> {xmlMeta.numero}{xmlMeta.serie ? ` / Série ${xmlMeta.serie}` : ''}</p>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.color}`}>
                      {s.label}
                    </span>
                    {d.url && (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/60 hover:bg-surface-container hover:text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">download</span>
                      </a>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-on-surface-variant">Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={`?page=${page - 1}${tipoFilter ? `&tipo=${tipoFilter}` : ''}`}
                className="rounded-lg border border-outline-variant px-3 py-1.5 text-on-surface hover:bg-surface-container transition-colors">
                ← Anterior
              </a>
            )}
            {page < totalPages && (
              <a href={`?page=${page + 1}${tipoFilter ? `&tipo=${tipoFilter}` : ''}`}
                className="rounded-lg border border-outline-variant px-3 py-1.5 text-on-surface hover:bg-surface-container transition-colors">
                Próxima →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
