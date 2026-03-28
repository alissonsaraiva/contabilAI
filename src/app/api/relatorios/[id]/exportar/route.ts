import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseRelatorioJSON } from '@/lib/relatorio-schema'

type Params = { params: Promise<{ id: string }> }

const FILL_HEADER = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE8EAF6' } }

export async function GET(req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const url = new URL(req.url)
  const formato = url.searchParams.get('formato') ?? 'pdf'

  const relatorio = await prisma.relatorioAgente.findUnique({ where: { id } })
  if (!relatorio) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const rel = parseRelatorioJSON(relatorio.conteudo)
  if (!rel) return NextResponse.json({ error: 'Relatório não está no formato estruturado JSON.' }, { status: 422 })

  const nomeArquivo = relatorio.titulo.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().replace(/\s+/g, '_')
  const geradoEm = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } as Intl.DateTimeFormatOptions)

  // ── PDF ──────────────────────────────────────────────────────────────────────
  if (formato === 'pdf') {
    const React = (await import('react')).default
    const { renderToBuffer } = await import('@react-pdf/renderer')
    const { RelatorioPDF } = await import('@/lib/pdf/relatorio-template')

    const element = React.createElement(RelatorioPDF, {
      titulo: relatorio.titulo,
      rel,
      geradoEm,
    })

    const buffer = await renderToBuffer(element as never)
    const uint8 = new Uint8Array(buffer)

    return new Response(uint8, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nomeArquivo}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  // ── XLS ──────────────────────────────────────────────────────────────────────
  if (formato === 'xls') {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'ContabAI'
    workbook.created = new Date()

    // Aba Resumo com KPIs (se houver)
    if (rel.kpis && rel.kpis.length > 0) {
      const wsResumo = workbook.addWorksheet('Resumo')
      wsResumo.columns = [
        { header: 'Indicador', key: 'label', width: 30 },
        { header: 'Valor',    key: 'valor', width: 20 },
      ]
      wsResumo.getRow(1).font = { bold: true }
      wsResumo.getRow(1).fill = FILL_HEADER
      for (const kpi of rel.kpis) {
        wsResumo.addRow({ label: kpi.label, valor: kpi.valor })
      }
    }

    // Uma aba por seção tabela
    const tabelas = rel.secoes.filter(s => s.tipo === 'tabela') as Array<{ tipo: 'tabela'; titulo: string; colunas: string[]; linhas: string[][] }>
    const textos  = rel.secoes.filter(s => s.tipo !== 'tabela')

    for (const tabela of tabelas) {
      const wsNome = tabela.titulo.substring(0, 30).replace(/[\\/?*[\]:]/g, '')
      const ws = workbook.addWorksheet(wsNome)
      ws.columns = tabela.colunas.map(col => ({
        header: col,
        key: col,
        width: Math.max(col.length + 4, 15),
      }))
      ws.getRow(1).font = { bold: true }
      ws.getRow(1).fill = FILL_HEADER
      for (const linha of tabela.linhas) {
        const rowObj: Record<string, string> = {}
        tabela.colunas.forEach((col, i) => { rowObj[col] = linha[i] ?? '' })
        ws.addRow(rowObj)
      }
    }

    // Aba Observações para seções texto/lista (se houver)
    if (textos.length > 0) {
      const wsObs = workbook.addWorksheet('Observações')
      wsObs.getColumn(1).width = 80
      for (const s of textos) {
        if (s.titulo) {
          const titleRow = wsObs.addRow([s.titulo])
          titleRow.font = { bold: true }
          wsObs.addRow([''])
        }
        if (s.tipo === 'texto') {
          wsObs.addRow([s.conteudo])
        } else if (s.tipo === 'lista') {
          for (const item of s.itens) wsObs.addRow([`• ${item}`])
        }
        wsObs.addRow([''])
      }
    }

    const rawBuffer = await workbook.xlsx.writeBuffer()
    const uint8 = new Uint8Array(rawBuffer)

    return new Response(uint8, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nomeArquivo}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  return NextResponse.json({ error: 'Formato inválido. Use pdf ou xls.' }, { status: 400 })
}
