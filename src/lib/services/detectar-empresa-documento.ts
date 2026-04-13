/**
 * Detecta qual empresa um documento pertence analisando CNPJs no conteúdo.
 *
 * Extrai todos os padrões de CNPJ do texto e compara com as empresas vinculadas
 * ao cliente. Retorna o empresaId se encontrar match único, null se ambíguo ou sem match.
 *
 * Usado pelo processamento automático de e-mail e WhatsApp para vincular
 * documentos à empresa correta quando o cliente tem N > 1 empresas.
 */
import { prisma } from '@/lib/prisma'
import { extrairConteudoDocumento } from './extrair-conteudo-documento'

/** Regex para capturar CNPJs em qualquer formato (com ou sem pontuação) */
const CNPJ_REGEX = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g

function soNumeros(v: string): string {
  return v.replace(/\D/g, '')
}

export async function detectarEmpresaPorConteudo(
  clienteId: string,
  arquivo: { buffer?: Buffer; mimeType: string; nome: string },
): Promise<string | null> {
  // Só faz sentido se o cliente tem múltiplas empresas
  const vinculos = await prisma.clienteEmpresa.findMany({
    where:  { clienteId },
    select: { empresaId: true, empresa: { select: { cnpj: true } } },
  })
  if (vinculos.length <= 1) return null

  // Mapa CNPJ limpo → empresaId
  const cnpjMap = new Map<string, string>()
  for (const v of vinculos) {
    if (v.empresa.cnpj) {
      cnpjMap.set(soNumeros(v.empresa.cnpj), v.empresaId)
    }
  }
  if (cnpjMap.size === 0) return null

  // Extrai texto do documento
  let texto: string | null = null
  try {
    const conteudo = await extrairConteudoDocumento({
      mimeType: arquivo.mimeType,
      nome:     arquivo.nome,
      buffer:   arquivo.buffer,
    })
    if (conteudo?.tipo === 'texto') {
      texto = conteudo.texto
    }
  } catch {
    return null
  }

  if (!texto) return null

  // Busca CNPJs no texto
  const matches = texto.match(CNPJ_REGEX)
  if (!matches || matches.length === 0) return null

  // Resolve: encontra empresas correspondentes
  const empresasEncontradas = new Set<string>()
  for (const match of matches) {
    const cnpjLimpo = soNumeros(match)
    const empresaId = cnpjMap.get(cnpjLimpo)
    if (empresaId) empresasEncontradas.add(empresaId)
  }

  // Match único = certeza; múltiplos = ambíguo (retorna null, usa principal)
  if (empresasEncontradas.size === 1) {
    return [...empresasEncontradas][0] ?? null
  }

  return null
}
