// Escopo define quem pode ver os vetores
export type EscopoRAG = 'global' | 'cliente' | 'lead'

// Canal define qual IA usa o conteúdo
// 'geral' aparece em todos os canais
export type CanalRAG = 'onboarding' | 'crm' | 'portal' | 'whatsapp' | 'geral'

// Tipos de conhecimento — determina como o conteúdo é tratado e filtrado
export type TipoConhecimento =
  // GLOBAL — base do escritório, visível para todos
  | 'base_conhecimento'    // FAQs, políticas, como funciona o escritório
  | 'fiscal_normativo'     // Legislação, IN, resoluções CFC, Simples Nacional
  | 'template'             // Modelos de documentos, respostas padrão

  // POR CLIENTE — isolado por clienteId
  | 'documento_cliente'    // Documentos que o cliente sobe no portal
  | 'nota_fiscal'          // NFe/NFSe emitidas para/pelo cliente
  | 'obrigacao_fiscal'     // Guias DAS, DCTF, certidões, SPED
  | 'dados_empresa'        // CNPJ, regime tributário, sócios, atividade
  | 'historico_crm'        // Interações e anotações internas do CRM

  // POR LEAD — isolado por leadId
  | 'dados_lead'           // Formulário de onboarding preenchido

export const TIPOS_GLOBAIS: TipoConhecimento[] = [
  'base_conhecimento',
  'fiscal_normativo',
  'template',
]

export const TIPOS_CLIENTE: TipoConhecimento[] = [
  'documento_cliente',
  'nota_fiscal',
  'obrigacao_fiscal',
  'dados_empresa',
  'historico_crm',
]
