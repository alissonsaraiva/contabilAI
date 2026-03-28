import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { RelatorioJSON } from '@/lib/relatorio-schema'

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: '#1a1a1a',
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 50,
    lineHeight: 1.6,
  },
  header: {
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#d0d0d0',
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#111',
  },
  headerSub: {
    fontSize: 8.5,
    color: '#666',
    marginTop: 3,
  },
  kpisRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    minWidth: 100,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
    padding: 8,
    backgroundColor: '#f9f9f9',
  },
  kpiLabel: {
    fontSize: 8,
    color: '#666',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  kpiValor: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#111',
  },
  kpiDangerValor: { color: '#c0392b' },
  kpiWarningValor: { color: '#e67e22' },
  kpiOkValor: { color: '#27ae60' },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#333',
    marginBottom: 6,
    marginTop: 16,
  },
  table: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 3,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tableRowLast: {
    flexDirection: 'row',
  },
  tableCell: {
    flex: 1,
    padding: 5,
    fontSize: 8.5,
    color: '#333',
  },
  tableCellHeader: {
    flex: 1,
    padding: 5,
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: '#444',
  },
  texto: {
    fontSize: 9,
    color: '#444',
    lineHeight: 1.6,
    marginBottom: 6,
  },
  listaItem: {
    fontSize: 9,
    color: '#444',
    marginBottom: 3,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7.5,
    color: '#999',
  },
})

type Props = {
  titulo: string
  rel: RelatorioJSON
  geradoEm: string
  escritorioNome?: string
}

function corValor(destaque?: string) {
  if (destaque === 'danger') return s.kpiDangerValor
  if (destaque === 'warning') return s.kpiWarningValor
  if (destaque === 'ok') return s.kpiOkValor
  return {}
}

export function RelatorioPDF({ titulo, rel, geradoEm, escritorioNome }: Props) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>{titulo}</Text>
          <Text style={s.headerSub}>
            {escritorioNome ? `${escritorioNome}  ·  ` : ''}Gerado em {geradoEm}
          </Text>
        </View>

        {/* KPIs */}
        {rel.kpis && rel.kpis.length > 0 && (
          <View style={s.kpisRow}>
            {rel.kpis.map((kpi, i) => (
              <View key={i} style={s.kpiCard}>
                <Text style={s.kpiLabel}>{kpi.label}</Text>
                <Text style={[s.kpiValor, corValor(kpi.destaque)]}>{String(kpi.valor)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Seções */}
        {rel.secoes.map((secao, i) => {
          if (secao.tipo === 'tabela') {
            return (
              <View key={i}>
                <Text style={s.sectionTitle}>{secao.titulo}</Text>
                <View style={s.table}>
                  <View style={s.tableHeader}>
                    {secao.colunas.map((col, j) => (
                      <Text key={j} style={s.tableCellHeader}>{col}</Text>
                    ))}
                  </View>
                  {secao.linhas.map((linha, j) => (
                    <View key={j} style={j === secao.linhas.length - 1 ? s.tableRowLast : s.tableRow}>
                      {linha.map((cel, k) => (
                        <Text key={k} style={s.tableCell}>{cel}</Text>
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            )
          }
          if (secao.tipo === 'texto') {
            return (
              <View key={i}>
                {secao.titulo && <Text style={s.sectionTitle}>{secao.titulo}</Text>}
                <Text style={s.texto}>{secao.conteudo}</Text>
              </View>
            )
          }
          if (secao.tipo === 'lista') {
            return (
              <View key={i}>
                {secao.titulo && <Text style={s.sectionTitle}>{secao.titulo}</Text>}
                {secao.itens.map((item, j) => (
                  <Text key={j} style={s.listaItem}>• {item}</Text>
                ))}
              </View>
            )
          }
          return null
        })}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{titulo}</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
