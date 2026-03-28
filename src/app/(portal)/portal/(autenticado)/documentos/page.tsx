import { auth } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { Card } from '@/components/ui/card'
import { PortalDocumentosUpload } from '@/components/portal/portal-documentos-upload'
import type { CategoriaDocumento } from '@prisma/client'
import Link from 'next/link'

const PER_PAGE = 30

type Props = { searchParams: Promise<{ page?: string; categoria?: string }> }

const CATEGORIAS: { value: CategoriaDocumento | 'todos'; label: string; icon: string }[] = [
  { value: 'todos',          label: 'Todos',          icon: 'folder_open' },
  { value: 'geral',          label: 'Geral',          icon: 'description' },
  { value: 'nota_fiscal',    label: 'Notas Fiscais',  icon: 'receipt_long' },
  { value: 'imposto_renda',  label: 'Imposto de Renda', icon: 'account_balance' },
  { value: 'guias_tributos', label: 'Guias e Tributos', icon: 'payments' },
  { value: 'relatorios',     label: 'Relatórios',     icon: 'bar_chart' },
  { value: 'outros',         label: 'Outros',         icon: 'more_horiz' },
]

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pendente:  { label: 'Pendente',  color: 'text-yellow-600 bg-yellow-500/10' },
  enviado:   { label: 'Enviado',   color: 'text-blue-600 bg-blue-500/10' },
  aprovado:  { label: 'Aprovado',  color: 'text-green-status bg-green-status/10' },
  rejeitado: { label: 'Rejeitado', color: 'text-error bg-error/10' },
}

function getIcon(mime: string | null, nome: string): string {
  if (!mime) {
    const ext = nome.split('.').pop()?.toLowerCase() ?? ''
    if (ext === 'xml')  return 'code'
    if (ext === 'pdf')  return 'picture_as_pdf'
    if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return 'image'
    if (['xls','xlsx','csv','ods'].includes(ext)) return 'table_chart'
    if (['doc','docx','odt','rtf'].includes(ext)) return 'article'
    if (['zip','rar','7z','tar','gz'].includes(ext)) return 'folder_zip'
    return 'description'
  }
  if (mime === 'application/pdf') return 'picture_as_pdf'
  if (mime.startsWith('image/'))  return 'image'
  if (mime.includes('xml'))       return 'code'
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv') return 'table_chart'
  if (mime.includes('word') || mime.includes('document')) return 'article'
  if (mime.includes('zip') || mime.includes('compressed')) return 'folder_zip'
  if (mime.startsWith('audio/'))  return 'audio_file'
  if (mime.startsWith('video/'))  return 'video_file'
  return 'description'
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

  // PJ: inclui documentos vinculados à empresa também
  const empresaId = user.empresaId as string | undefined

  const sp         = await searchParams
  const page       = Math.max(1, parseInt(sp.page ?? '1'))
  const skip       = (page - 1) * PER_PAGE
  const catFilter  = (sp.categoria as CategoriaDocumento | undefined)

  // Base filter: docs do cliente OU da empresa (para PJ)
  const baseWhere: any = empresaId
    ? { OR: [{ clienteId }, { empresaId }] }
    : { clienteId }

  const where: any = { ...baseWhere }
  if (catFilter) where.categoria = catFilter

  const baseWhereForCount = empresaId
    ? { OR: [{ clienteId }, { empresaId }] }
    : { clienteId }

  const [documentos, total, contagens] = await Promise.all([
    prisma.documento.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip,
      take: PER_PAGE,
    }),
    prisma.documento.count({ where }),
    // Conta por categoria para mostrar badges
    prisma.documento.groupBy({
      by: ['categoria'],
      where: baseWhereForCount,
      _count: { id: true },
    }),
  ])

  const totalPages = Math.ceil(total / PER_PAGE)
  const contagemMap = Object.fromEntries(contagens.map(c => [c.categoria, c._count.id]))
  const totalGeral = contagens.reduce((acc, c) => acc + c._count.id, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-semibold text-on-surface">Documentos</h1>
        <p className="text-sm text-on-surface-variant/70 mt-1">
          Documentos enviados pelo escritório e arquivos que você enviou.
        </p>
      </div>

      {/* Upload */}
      <PortalDocumentosUpload />

      {/* Tabs por categoria */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIAS.map(cat => {
          const count = cat.value === 'todos' ? totalGeral : (contagemMap[cat.value] ?? 0)
          const isActive = catFilter === cat.value || (!catFilter && cat.value === 'todos')
          if (cat.value !== 'todos' && count === 0) return null
          return (
            <Link
              key={cat.value}
              href={cat.value === 'todos' ? '/portal/documentos' : `?categoria=${cat.value}`}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all ${
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>{cat.icon}</span>
              {cat.label}
              {count > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] font-bold ${isActive ? 'bg-white/20' : 'bg-surface-container-high'}`}>
                  {count}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      {documentos.length === 0 ? (
        <Card className="border-outline-variant/15 bg-card/60 p-10 rounded-[16px] shadow-sm flex flex-col items-center gap-3 text-center">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant/25">folder_open</span>
          <p className="text-[14px] font-medium text-on-surface-variant/60">
            {catFilter ? 'Nenhum documento nesta categoria.' : 'Nenhum documento encontrado.'}
          </p>
        </Card>
      ) : (
        <Card className="border-outline-variant/15 bg-card/60 rounded-[16px] shadow-sm overflow-hidden">
          <ul className="divide-y divide-outline-variant/10">
            {documentos.map(d => {
              const s      = STATUS_LABEL[d.status] ?? { label: d.status, color: 'text-on-surface-variant bg-surface-container' }
              const icon   = getIcon(d.mimeType, d.nome)
              const isXML  = d.mimeType?.includes('xml') || d.nome.toLowerCase().endsWith('.xml')
              const xmlMeta = d.xmlMetadata as any
              const catInfo = CATEGORIAS.find(c => c.value === d.categoria)
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
                      {catInfo && catInfo.value !== 'todos' && (
                        <span className="text-[10px] font-medium text-on-surface-variant/40">{catInfo.label}</span>
                      )}
                      {d.origem === 'portal' && (
                        <span className="text-[10px] font-semibold text-primary/70">↑ enviado por você</span>
                      )}
                    </div>
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
              <Link href={`?page=${page - 1}${catFilter ? `&categoria=${catFilter}` : ''}`}
                className="rounded-lg border border-outline-variant px-3 py-1.5 text-on-surface hover:bg-surface-container transition-colors">
                ← Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link href={`?page=${page + 1}${catFilter ? `&categoria=${catFilter}` : ''}`}
                className="rounded-lg border border-outline-variant px-3 py-1.5 text-on-surface hover:bg-surface-container transition-colors">
                Próxima →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
