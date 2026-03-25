import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const PLANO_LABELS: Record<string, string> = {
  essencial: 'Essencial',
  profissional: 'Profissional',
  empresarial: 'Empresarial',
  startup: 'Startup',
}

const FORMA_LABELS: Record<string, string> = {
  pix: 'PIX',
  boleto: 'Boleto Bancário',
  cartao: 'Cartão de Crédito/Débito',
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

function fmtData(d: Date) {
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function fmtHora(d: Date) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: '#1a1a1a',
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 60,
    lineHeight: 1.6,
  },
  header: {
    marginBottom: 28,
    alignItems: 'center',
  },
  headerNome: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
  },
  headerSub: {
    fontSize: 8.5,
    color: '#555',
    marginTop: 2,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#d0d0d0',
    marginVertical: 12,
  },
  titulo: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginBottom: 6,
    color: '#111',
  },
  subtitulo: {
    fontSize: 8.5,
    textAlign: 'center',
    color: '#666',
    marginBottom: 20,
  },
  clausulaTitulo: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    marginTop: 14,
    marginBottom: 4,
    color: '#111',
  },
  paragrafo: {
    marginBottom: 5,
    textAlign: 'justify',
  },
  item: {
    marginLeft: 12,
    marginBottom: 3,
    textAlign: 'justify',
  },
  boxInfo: {
    backgroundColor: '#f5f5f5',
    borderRadius: 4,
    padding: 10,
    marginVertical: 10,
  },
  boxRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  boxLabel: {
    fontFamily: 'Helvetica-Bold',
    width: 120,
    fontSize: 9,
    color: '#444',
  },
  boxValue: {
    flex: 1,
    fontSize: 9,
    color: '#1a1a1a',
  },
  assinaturaBox: {
    marginTop: 30,
    borderTopWidth: 1,
    borderTopColor: '#d0d0d0',
    paddingTop: 16,
  },
  assinaturaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  assinaturaCol: {
    width: '45%',
    alignItems: 'center',
  },
  assinaturaLinha: {
    borderBottomWidth: 1,
    borderBottomColor: '#999',
    width: '100%',
    marginBottom: 5,
    height: 24,
  },
  assinaturaNome: {
    fontSize: 8,
    textAlign: 'center',
    color: '#444',
  },
  rodape: {
    position: 'absolute',
    bottom: 30,
    left: 60,
    right: 60,
    textAlign: 'center',
    fontSize: 7.5,
    color: '#999',
  },
  pageNumber: {
    position: 'absolute',
    bottom: 30,
    right: 60,
    fontSize: 7.5,
    color: '#bbb',
  },
})

export interface ContratoPDFProps {
  nome: string
  cpf: string
  email: string
  telefone: string
  cnpj?: string
  razaoSocial?: string
  cidade?: string
  plano: string
  valor: number
  vencimentoDia: number
  formaPagamento: string
  assinadoEm: Date
  assinatura: string
  escritorioNome: string
  escritorioCnpj?: string | null
  escritorioCrc?: string | null
  escritorioCidade?: string | null
}

export function ContratoPDF(p: ContratoPDFProps) {
  const dataStr = fmtData(p.assinadoEm)
  const horaStr = fmtHora(p.assinadoEm)

  return (
    <Document
      title="Contrato de Prestação de Serviços Contábeis"
      author={p.escritorioNome}
    >
      <Page size="A4" style={s.page}>

        {/* Cabeçalho */}
        <View style={s.header}>
          <Text style={s.headerNome}>{p.escritorioNome}</Text>
          {p.escritorioCrc && <Text style={s.headerSub}>CRC: {p.escritorioCrc}</Text>}
          {p.escritorioCnpj && <Text style={s.headerSub}>CNPJ: {p.escritorioCnpj}</Text>}
          {p.escritorioCidade && <Text style={s.headerSub}>{p.escritorioCidade}</Text>}
        </View>

        <View style={s.divider} />

        <Text style={s.titulo}>CONTRATO DE PRESTAÇÃO DE SERVIÇOS CONTÁBEIS</Text>
        <Text style={s.subtitulo}>
          Plano {PLANO_LABELS[p.plano] ?? p.plano} · Celebrado em {dataStr}
        </Text>

        {/* Identificação das partes */}
        <Text style={s.clausulaTitulo}>DAS PARTES</Text>
        <View style={s.boxInfo}>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8.5, marginBottom: 5, color: '#555' }}>
            CONTRATADA
          </Text>
          <View style={s.boxRow}>
            <Text style={s.boxLabel}>Razão Social:</Text>
            <Text style={s.boxValue}>{p.escritorioNome}</Text>
          </View>
          {p.escritorioCnpj && (
            <View style={s.boxRow}>
              <Text style={s.boxLabel}>CNPJ:</Text>
              <Text style={s.boxValue}>{p.escritorioCnpj}</Text>
            </View>
          )}
          {p.escritorioCrc && (
            <View style={s.boxRow}>
              <Text style={s.boxLabel}>CRC:</Text>
              <Text style={s.boxValue}>{p.escritorioCrc}</Text>
            </View>
          )}
        </View>

        <View style={[s.boxInfo, { marginTop: 6 }]}>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8.5, marginBottom: 5, color: '#555' }}>
            CONTRATANTE
          </Text>
          <View style={s.boxRow}>
            <Text style={s.boxLabel}>Nome completo:</Text>
            <Text style={s.boxValue}>{p.nome}</Text>
          </View>
          <View style={s.boxRow}>
            <Text style={s.boxLabel}>CPF:</Text>
            <Text style={s.boxValue}>{p.cpf}</Text>
          </View>
          {p.cnpj && (
            <View style={s.boxRow}>
              <Text style={s.boxLabel}>CNPJ:</Text>
              <Text style={s.boxValue}>{p.cnpj}</Text>
            </View>
          )}
          {p.razaoSocial && (
            <View style={s.boxRow}>
              <Text style={s.boxLabel}>Razão Social:</Text>
              <Text style={s.boxValue}>{p.razaoSocial}</Text>
            </View>
          )}
          <View style={s.boxRow}>
            <Text style={s.boxLabel}>E-mail:</Text>
            <Text style={s.boxValue}>{p.email}</Text>
          </View>
          <View style={s.boxRow}>
            <Text style={s.boxLabel}>Telefone/WhatsApp:</Text>
            <Text style={s.boxValue}>{p.telefone}</Text>
          </View>
          {p.cidade && (
            <View style={s.boxRow}>
              <Text style={s.boxLabel}>Cidade:</Text>
              <Text style={s.boxValue}>{p.cidade}</Text>
            </View>
          )}
        </View>

        {/* Cláusulas */}
        <Text style={s.clausulaTitulo}>CLÁUSULA 1 – DO OBJETO</Text>
        <Text style={s.paragrafo}>
          O presente instrumento tem por objeto a prestação de serviços contábeis ao CONTRATANTE, conforme o Plano {PLANO_LABELS[p.plano] ?? p.plano}, que compreende:
        </Text>
        <Text style={s.item}>a) Escrituração contábil e fiscal;</Text>
        <Text style={s.item}>b) Apuração e recolhimento de tributos federais, estaduais e municipais;</Text>
        <Text style={s.item}>c) Elaboração e entrega de obrigações acessórias previstas em lei;</Text>
        <Text style={s.item}>d) Processamento da folha de pagamento e encargos trabalhistas (conforme plano contratado);</Text>
        <Text style={s.item}>e) Declarações anuais aplicáveis ao enquadramento do CONTRATANTE;</Text>
        <Text style={s.item}>f) Atendimento via portal digital e canais de comunicação da CONTRATADA.</Text>

        <Text style={s.clausulaTitulo}>CLÁUSULA 2 – DO VALOR E PAGAMENTO</Text>
        <Text style={s.paragrafo}>
          O valor mensal pelos serviços prestados é de R$ {fmt(p.valor)} ({p.valor === 199 ? 'cento e noventa e nove reais' : `${fmt(p.valor)} reais`}), com vencimento todo dia {p.vencimentoDia} de cada mês, mediante {FORMA_LABELS[p.formaPagamento] ?? p.formaPagamento}.
        </Text>
        <Text style={s.paragrafo}>
          O atraso no pagamento por prazo superior a 15 (quinze) dias ensejará a cobrança de multa de 2% e juros de 1% ao mês, além de correção monetária pelo IPCA. O inadimplemento superior a 60 (sessenta) dias autoriza a CONTRATADA a suspender os serviços e rescindir o contrato.
        </Text>

        <Text style={s.clausulaTitulo}>CLÁUSULA 3 – DA VIGÊNCIA</Text>
        <Text style={s.paragrafo}>
          O presente contrato é celebrado por prazo indeterminado, com início na data de sua assinatura digital, podendo ser rescindido por qualquer das partes mediante comunicação prévia e por escrito com antecedência mínima de 30 (trinta) dias.
        </Text>

        <Text style={s.clausulaTitulo}>CLÁUSULA 4 – DAS OBRIGAÇÕES DO CONTRATANTE</Text>
        <Text style={s.item}>a) Fornecer, tempestivamente, todos os documentos, notas fiscais, extratos e informações necessários à regular prestação dos serviços;</Text>
        <Text style={s.item}>b) Comunicar imediatamente qualquer alteração societária, mudança de atividade econômica, endereço ou quadro de funcionários;</Text>
        <Text style={s.item}>c) Efetuar os pagamentos dentro dos prazos estabelecidos;</Text>
        <Text style={s.item}>d) Não contratar outros profissionais contábeis para as mesmas atividades objeto deste contrato sem prévia comunicação.</Text>

        <Text style={s.clausulaTitulo}>CLÁUSULA 5 – DAS OBRIGAÇÕES DA CONTRATADA</Text>
        <Text style={s.item}>a) Prestar os serviços descritos no objeto com qualidade e diligência, observando as normas técnicas do CFC;</Text>
        <Text style={s.item}>b) Manter profissional devidamente habilitado e registrado no CRC responsável pelos serviços;</Text>
        <Text style={s.item}>c) Guardar sigilo profissional absoluto sobre todas as informações do CONTRATANTE;</Text>
        <Text style={s.item}>d) Cumprir os prazos legais pertinentes às obrigações sob sua responsabilidade, desde que os documentos sejam entregues pelo CONTRATANTE com antecedência mínima de 5 (cinco) dias úteis.</Text>

        <Text style={s.clausulaTitulo}>CLÁUSULA 6 – DA RESPONSABILIDADE</Text>
        <Text style={s.paragrafo}>
          A CONTRATADA não se responsabiliza por multas, juros ou penalidades decorrentes de informações incorretas, incompletas ou entregues fora do prazo pelo CONTRATANTE. A responsabilidade da CONTRATADA restringe-se aos erros decorrentes exclusivamente da prestação dos serviços contábeis.
        </Text>

        <Text style={s.clausulaTitulo}>CLÁUSULA 7 – DA CONFIDENCIALIDADE</Text>
        <Text style={s.paragrafo}>
          As partes obrigam-se a manter sigilo absoluto sobre as informações trocadas no âmbito deste contrato, não podendo divulgá-las a terceiros sem autorização expressa, sob pena de responsabilização civil e criminal.
        </Text>

        <Text style={s.clausulaTitulo}>CLÁUSULA 8 – DA ASSINATURA ELETRÔNICA</Text>
        <Text style={s.paragrafo}>
          Este contrato é celebrado e assinado eletronicamente nos termos da Lei nº 14.063, de 23 de setembro de 2020, tendo plena validade jurídica a assinatura digital realizada pelo CONTRATANTE em {dataStr} às {horaStr}.
        </Text>

        <Text style={s.clausulaTitulo}>CLÁUSULA 9 – DO FORO</Text>
        <Text style={s.paragrafo}>
          Fica eleito o foro da comarca de {p.escritorioCidade ?? p.cidade ?? 'domicílio da CONTRATADA'} para dirimir eventuais controvérsias oriundas deste contrato, renunciando as partes a qualquer outro, por mais privilegiado que seja.
        </Text>

        <View style={s.divider} />

        {/* Assinatura */}
        <View style={s.assinaturaBox}>
          <Text style={{ fontSize: 8.5, textAlign: 'center', color: '#555', marginBottom: 12 }}>
            Assinado digitalmente em {dataStr} às {horaStr}
          </Text>
          <View style={s.assinaturaRow}>
            <View style={s.assinaturaCol}>
              <View style={s.assinaturaLinha} />
              <Text style={s.assinaturaNome}>{p.escritorioNome}</Text>
              {p.escritorioCnpj && (
                <Text style={[s.assinaturaNome, { color: '#888' }]}>CNPJ: {p.escritorioCnpj}</Text>
              )}
              <Text style={[s.assinaturaNome, { color: '#888', marginTop: 2 }]}>CONTRATADA</Text>
            </View>
            <View style={s.assinaturaCol}>
              <View style={s.assinaturaLinha}>
                <Text style={{ fontSize: 8, color: '#555', textAlign: 'center', paddingTop: 6 }}>
                  {p.assinatura}
                </Text>
              </View>
              <Text style={s.assinaturaNome}>{p.nome}</Text>
              <Text style={[s.assinaturaNome, { color: '#888' }]}>CPF: {p.cpf}</Text>
              <Text style={[s.assinaturaNome, { color: '#888', marginTop: 2 }]}>CONTRATANTE</Text>
            </View>
          </View>
          <Text style={{ fontSize: 7.5, textAlign: 'center', color: '#aaa', marginTop: 14 }}>
            Assinatura eletrônica com validade jurídica conforme Lei 14.063/2020 · IP registrado em {dataStr} {horaStr}
          </Text>
        </View>

        {/* Rodapé */}
        <Text style={s.rodape}>{p.escritorioNome} · Contrato gerado automaticamente via portal</Text>
        <Text
          style={s.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  )
}
