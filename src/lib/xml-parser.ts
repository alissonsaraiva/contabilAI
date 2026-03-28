import { XMLParser } from 'fast-xml-parser'

export type TipoXML = 'NFe' | 'NFC-e' | 'CT-e' | 'NFS-e' | 'desconhecido'

export type XMLMetadata = {
  tipo: TipoXML
  numero?: string
  serie?: string
  chave?: string
  dataEmissao?: string
  emitenteCnpj?: string
  emitenteNome?: string
  destinatarioCnpj?: string
  destinatarioNome?: string
  valorTotal?: number
  naturezaOperacao?: string
  municipio?: string
  status?: string
  raw?: Record<string, unknown>
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: true,
  parseTagValue: true,
})

export function parseXML(content: string): XMLMetadata {
  try {
    const obj = parser.parse(content)

    // NFe / NFC-e
    const nfeProc = obj?.nfeProc
    const nfe = nfeProc?.NFe ?? obj?.NFe
    if (nfe) {
      const infNFe = nfe?.infNFe
      const ide = infNFe?.ide
      const emit = infNFe?.emit
      const dest = infNFe?.dest
      const total = infNFe?.total?.ICMSTot
      const mod = ide?.mod
      const tipo: TipoXML = mod === 65 ? 'NFC-e' : 'NFe'

      return {
        tipo,
        numero: String(ide?.nNF ?? ''),
        serie: String(ide?.serie ?? ''),
        chave: String(infNFe?.['@_Id'] ?? '').replace(/^NFe/, ''),
        dataEmissao: ide?.dhEmi ?? ide?.dEmi,
        emitenteCnpj: String(emit?.CNPJ ?? ''),
        emitenteNome: emit?.xNome,
        destinatarioCnpj: String(dest?.CNPJ ?? dest?.CPF ?? ''),
        destinatarioNome: dest?.xNome,
        valorTotal: Number(total?.vNF ?? 0),
        naturezaOperacao: ide?.natOp,
        municipio: emit?.enderEmit?.xMun,
        status: nfeProc?.protNFe?.infProt?.cStat
          ? `${nfeProc.protNFe.infProt.cStat} - ${nfeProc.protNFe.infProt.xMotivo}`
          : undefined,
      }
    }

    // CT-e
    const cteProc = obj?.cteProc
    const cte = cteProc?.CTe ?? obj?.CTe
    if (cte) {
      const infCte = cte?.infCte
      const ide = infCte?.ide
      const emit = infCte?.emit
      const dest = infCte?.dest
      const vPrest = infCte?.vPrest

      return {
        tipo: 'CT-e',
        numero: String(ide?.nCT ?? ''),
        serie: String(ide?.serie ?? ''),
        chave: String(infCte?.['@_Id'] ?? '').replace(/^CTe/, ''),
        dataEmissao: ide?.dhEmi,
        emitenteCnpj: String(emit?.CNPJ ?? ''),
        emitenteNome: emit?.xNome,
        destinatarioCnpj: String(dest?.CNPJ ?? ''),
        destinatarioNome: dest?.xNome,
        valorTotal: Number(vPrest?.vTPrest ?? 0),
        naturezaOperacao: ide?.natOp,
        municipio: emit?.enderEmit?.xMun,
      }
    }

    // NFS-e (padrão ABRASF / Betha — campos variam por município)
    const compNfse = obj?.CompNfse ?? obj?.ListaNfse?.CompNfse
    const nfse = Array.isArray(compNfse) ? compNfse[0]?.Nfse : compNfse?.Nfse
    if (nfse) {
      const inf = nfse?.InfNfse
      const prest = inf?.PrestadorServico
      const tom = inf?.TomadorServico

      return {
        tipo: 'NFS-e',
        numero: String(inf?.Numero ?? ''),
        dataEmissao: inf?.DataEmissao,
        emitenteCnpj: String(prest?.IdentificacaoPrestador?.Cnpj ?? ''),
        emitenteNome: prest?.RazaoSocial,
        destinatarioCnpj: String(tom?.IdentificacaoTomador?.CpfCnpj?.Cnpj ?? tom?.IdentificacaoTomador?.CpfCnpj?.Cpf ?? ''),
        destinatarioNome: tom?.RazaoSocial,
        valorTotal: Number(inf?.Servico?.Valores?.ValorServicos ?? 0),
        naturezaOperacao: inf?.NaturezaOperacao ? String(inf.NaturezaOperacao) : undefined,
        municipio: prest?.Endereco?.Municipio,
      }
    }

    return { tipo: 'desconhecido' }
  } catch {
    return { tipo: 'desconhecido' }
  }
}

export function detectaTipoXML(content: string): TipoXML {
  if (content.includes('<NFe') || content.includes('<nfeProc')) return 'NFe'
  if (content.includes('<CTe') || content.includes('<cteProc')) return 'CT-e'
  if (content.includes('<CompNfse') || content.includes('<Nfse')) return 'NFS-e'
  return 'desconhecido'
}
