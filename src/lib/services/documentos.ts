/**
 * criarDocumento — service core do gerenciador de documentos.
 *
 * Ponto de entrada único para TODA criação de Documento, independente da origem:
 *   - CRM (contador envia)            → origem: 'crm'
 *   - Portal (cliente faz upload)     → origem: 'portal'
 *   - Integração externa (NFe, ERP)   → origem: 'integracao'
 *
 * Responsabilidades:
 *   1. Upload para S3 (se buffer fornecido)
 *   2. Parse de XML (NFe, CT-e, etc.) para extrair metadata
 *   3. Criação do registro no banco com todos os vínculos
 *   4. Indexação assíncrona no RAG
 *
 * Futuramente, webhooks externos chamam este service diretamente.
 */

import { prisma } from '@/lib/prisma'
import { uploadArquivo, storageKeys } from '@/lib/storage'
import { parseXML } from '@/lib/xml-parser'
import { indexarAsync } from '@/lib/rag/indexar-async'
import type { CategoriaDocumento } from '@prisma/client'
import { nanoid } from 'nanoid'

export type CriarDocumentoInput = {
  // Vínculos — ao menos um deve ser fornecido
  clienteId?:      string
  leadId?:         string
  empresaId?:      string
  ordemServicoId?: string

  // Arquivo: fornecer buffer+nome+mimeType OU url já hospedada
  arquivo?: {
    buffer:   Buffer
    nome:     string
    mimeType: string
  }
  url?:      string   // URL já hospedada externamente
  nome?:     string   // obrigatório se url fornecida sem arquivo

  // Metadados do documento
  tipo:       string             // string livre legível, ex: 'Nota Fiscal', 'Guia DAS'
  categoria?: CategoriaDocumento // default: 'geral'
  status?:    string             // default: 'aprovado' (crm) | 'pendente' (portal)
  observacao?: string

  // Origem e rastreabilidade
  origem:        'crm' | 'portal' | 'integracao'
  integracaoId?: string   // ex: 'focus_nfe', 'contaazul', 'sefaz'
  metadados?:    Record<string, unknown>
}

export type CriarDocumentoResult = {
  id:          string
  url:         string
  nome:        string
  categoria:   CategoriaDocumento
  xmlMetadata: unknown
}

export async function criarDocumento(input: CriarDocumentoInput): Promise<CriarDocumentoResult> {
  let url:         string
  let nome:        string
  let tamanho:     number | undefined
  let xmlMetadata: unknown = null

  // 1. Upload S3 (se buffer fornecido)
  if (input.arquivo) {
    nome = input.arquivo.nome
    const ext = nome.split('.').pop() ?? 'bin'
    const key = buildStorageKey(input, `${nanoid(8)}.${ext}`)
    url       = await uploadArquivo(key, input.arquivo.buffer, input.arquivo.mimeType)
    tamanho   = input.arquivo.buffer.byteLength

    // 2. Parse XML automático (NFe, CT-e, NFS-e, etc.)
    const isXML = input.arquivo.mimeType.includes('xml') || nome.toLowerCase().endsWith('.xml')
    if (isXML) {
      xmlMetadata = parseXML(input.arquivo.buffer.toString('utf-8'))
    }
  } else if (input.url && input.nome) {
    url  = input.url
    nome = input.nome
  } else {
    throw new Error('criarDocumento: forneça arquivo (buffer) ou url+nome')
  }

  // 3. Categoria: usa a fornecida, ou infere do XML, ou default 'geral'
  const categoria = resolverCategoria(input.categoria, xmlMetadata)

  // 4. Status default: aprovado para crm/integracao, pendente para portal
  const status = input.status ?? (input.origem === 'portal' ? 'pendente' : 'aprovado')

  // 5. Criação no banco
  const documento = await prisma.documento.create({
    data: {
      clienteId:      input.clienteId,
      leadId:         input.leadId,
      empresaId:      input.empresaId,
      ordemServicoId: input.ordemServicoId,
      tipo:           input.tipo,
      categoria,
      nome,
      url,
      tamanho,
      mimeType:       input.arquivo?.mimeType,
      status,
      observacao:     input.observacao,
      origem:         input.origem,
      integracaoId:   input.integracaoId,
      xmlMetadata:    xmlMetadata as never,
    },
  })

  // 6. Indexa no RAG (fire-and-forget)
  indexarAsync('documento', {
    id:        documento.id,
    clienteId: input.clienteId,
    empresaId: input.empresaId,
    leadId:    input.leadId,
    tipo:      input.tipo,
    nome,
    categoria,
    origem:    input.origem,
    criadoEm:  documento.criadoEm,
  })

  return {
    id:          documento.id,
    url,
    nome,
    categoria,
    xmlMetadata,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildStorageKey(input: CriarDocumentoInput, nomeArquivo: string): string {
  if (input.empresaId)  return storageKeys.documentoEmpresa(input.empresaId, nomeArquivo)
  if (input.clienteId)  return storageKeys.documentoCliente(input.clienteId, nomeArquivo)
  if (input.leadId)     return storageKeys.documentoLead(input.leadId, nomeArquivo)
  return `docs/sem-vinculo/${nomeArquivo}`
}

function resolverCategoria(
  categoriaInput: CategoriaDocumento | undefined,
  xmlMeta: unknown,
): CategoriaDocumento {
  if (categoriaInput) return categoriaInput

  // Infere do XML se disponível
  if (xmlMeta && typeof xmlMeta === 'object') {
    const tipo = (xmlMeta as any).tipo as string | undefined
    if (tipo === 'NFe' || tipo === 'NFC-e' || tipo === 'NFS-e') return 'nota_fiscal'
    if (tipo === 'CT-e') return 'relatorios'
  }

  return 'geral'
}
