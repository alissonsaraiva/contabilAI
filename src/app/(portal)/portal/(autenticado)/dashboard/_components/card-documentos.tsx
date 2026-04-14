import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { DocItem } from '../doc-item'

function getExt(nome: string) {
  return nome.split('.').pop()?.toUpperCase() ?? 'DOC'
}

function extColor(ext: string) {
  if (ext === 'PDF') return 'bg-error/10 text-error'
  if (ext === 'XML') return 'bg-green-status/10 text-green-status'
  if (ext === 'XLS' || ext === 'XLSX') return 'bg-green-status/10 text-green-status'
  return 'bg-primary/10 text-primary'
}

export async function CardDocumentos({ clienteId }: { clienteId: string }) {
  // docsNovos = total real de não-visualizados (não só os 6 da lista)
  const [documentos, docsNovos] = await Promise.all([
    prisma.documento.findMany({
      where: { clienteId, deletadoEm: null },
      orderBy: { criadoEm: 'desc' },
      take: 6,
      select: {
        id: true, nome: true, tipo: true, url: true,
        criadoEm: true, status: true, visualizadoEm: true,
      },
    }),
    prisma.documento.count({ where: { clienteId, deletadoEm: null, visualizadoEm: null } }),
  ])

  return (
    <div className="rounded-[16px] border border-outline-variant/15 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-outline-variant/10 p-4 sm:px-5 sm:py-4">
        <div className="flex items-center gap-2.5">
          <span
            className="material-symbols-outlined text-[20px] text-on-surface-variant"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            folder_open
          </span>
          <h2 className="font-headline text-[14px] font-semibold text-on-surface">Documentos disponíveis</h2>
          {docsNovos > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">
              {docsNovos}
            </span>
          )}
        </div>
        <Link href="/portal/documentos" className="text-[12px] font-semibold text-primary hover:underline">
          Ver todos →
        </Link>
      </div>

      {documentos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span
            className="material-symbols-outlined text-[40px] text-on-surface-variant/25"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            inbox
          </span>
          <p className="text-[13px] text-on-surface-variant/60">Você ainda não tem documentos aqui. Os arquivos enviados pelo escritório aparecerão nesta tela.</p>
        </div>
      ) : (
        <ul className="divide-y divide-outline-variant/8">
          {documentos.map(d => {
            const ext = getExt(d.nome)
            return (
              <DocItem
                key={d.id}
                id={d.id}
                nome={d.nome}
                ext={ext}
                criadoEm={new Date(d.criadoEm).toISOString()}
                visualizadoEm={d.visualizadoEm ? new Date(d.visualizadoEm).toISOString() : null}
                extColor={extColor(ext)}
              />
            )
          })}
        </ul>
      )}
    </div>
  )
}
