import { indexar, getEmbeddingKeys } from './_core'

// ─── Planos do escritório — definição canônica ────────────────────────────────
// Usada tanto no onboarding quanto como fallback do indexarPlanos quando o banco está vazio.
export const PLANOS_INFO = [
  {
    tipo: 'essencial',
    nome: 'Essencial',
    desc: 'Ideal para MEI e microempresas',
    faixaPreco: 'R$ 179 – R$ 299/mês',
    servicos: [
      'Obrigações fiscais acessórias',
      'Geração de DAS automática',
      'Portal básico do cliente',
      'Chatbot de dúvidas 24h',
      'Alertas de prazo por WhatsApp',
    ],
  },
  {
    tipo: 'profissional',
    nome: 'Profissional',
    desc: 'Para empresas do Simples Nacional',
    faixaPreco: 'R$ 449 – R$ 699/mês',
    servicos: [
      'Tudo do Essencial',
      'Depto. pessoal (até 3 funcionários)',
      'DRE simplificado mensal',
      'Fluxo de caixa',
      'Relatório narrativo com IA',
    ],
  },
  {
    tipo: 'empresarial',
    nome: 'Empresarial',
    desc: 'Para Lucro Presumido e Real',
    faixaPreco: 'R$ 990 – R$ 1.800/mês',
    servicos: [
      'Tudo do Profissional',
      'Depto. pessoal ilimitado',
      'KPIs avançados e dashboards',
      'Consultoria mensal de 1h',
      'Simulação de cenários tributários',
    ],
  },
  {
    tipo: 'startup',
    nome: 'Startup',
    desc: 'Para empresas digitais em crescimento',
    faixaPreco: 'R$ 1.200 – R$ 2.500/mês',
    servicos: [
      'Tudo do Empresarial',
      'Relatórios para investidores',
      'Benchmark setorial com IA',
      'Suporte prioritário',
      'Planejamento tributário estratégico',
    ],
  },
]

// ─── Escritório ─────────────────────────────────────────────────────────────

type EscritorioData = {
  id: string
  nome: string
  nomeFantasia?: string | null
  cnpj?: string | null
  crc?: string | null
  email?: string | null
  telefone?: string | null
  whatsapp?: string | null
  cidade?: string | null
  uf?: string | null
  logradouro?: string | null
  bairro?: string | null
  fraseBemVindo?: string | null
  metaDescricao?: string | null
  // Termos contratuais — usados pela IA ao explicar multa, juros, desconto Pix
  multaPercent?: number | null
  jurosMesPercent?: number | null
  diasAtrasoMulta?: number | null
  pixDescontoPercent?: number | null
}

// Indexa os dados do escritório em canal 'geral' — disponível para todas as IAs
export async function indexarEscritorio(escritorio: EscritorioData): Promise<void> {
  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const linhas = [
    `Escritório de contabilidade: ${escritorio.nomeFantasia ?? escritorio.nome}`,
    escritorio.cnpj      ? `CNPJ: ${escritorio.cnpj}` : '',
    escritorio.crc       ? `CRC: ${escritorio.crc}` : '',
    escritorio.email     ? `E-mail: ${escritorio.email}` : '',
    escritorio.telefone  ? `Telefone: ${escritorio.telefone}` : '',
    escritorio.whatsapp  ? `WhatsApp: ${escritorio.whatsapp}` : '',
    (escritorio.cidade || escritorio.uf)
      ? `Cidade: ${[escritorio.cidade, escritorio.uf].filter(Boolean).join(' / ')}`
      : '',
    escritorio.logradouro ? `Endereço: ${escritorio.logradouro}${escritorio.bairro ? ', ' + escritorio.bairro : ''}` : '',
    escritorio.fraseBemVindo  ? `Apresentação: ${escritorio.fraseBemVindo}` : '',
    escritorio.metaDescricao  ? `Descrição: ${escritorio.metaDescricao}` : '',
    // Termos contratuais — informados pela IA quando clientes perguntam sobre encargos
    escritorio.multaPercent      != null ? `Multa por atraso: ${escritorio.multaPercent}%` : '',
    escritorio.jurosMesPercent   != null ? `Juros mensais: ${escritorio.jurosMesPercent}%` : '',
    escritorio.diasAtrasoMulta   != null ? `Multa aplicada após: ${escritorio.diasAtrasoMulta} dias de atraso` : '',
    escritorio.pixDescontoPercent != null ? `Desconto para pagamento via Pix: ${escritorio.pixDescontoPercent}%` : '',
  ].filter(Boolean).join('\n')

  await indexar(linhas, {
    escopo: 'global',
    canal: 'geral',
    tipo: 'base_conhecimento',
    documentoId: `escritorio:${escritorio.id}`,
    titulo: `Dados do escritório — ${escritorio.nomeFantasia ?? escritorio.nome}`,
  }, keys)
}

// ─── Planos ──────────────────────────────────────────────────────────────────

// Indexa os planos no canal 'geral' — disponível para todas as IAs.
// Lê do banco (tabela Plano). Se vazio, usa PLANOS_INFO como fallback.
export async function indexarPlanos(): Promise<void> {
  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  // Tenta carregar do banco — usa fallback hardcoded se banco retornar vazio
  let planosParaIndexar: Array<{ nome: string; descricao?: string | null; valorMinimo: unknown; valorMaximo: unknown; servicos: unknown }>
  try {
    const { prisma } = await import('@/lib/prisma')
    const dbPlanos = await prisma.plano.findMany({ where: { ativo: true }, orderBy: { valorMinimo: 'asc' } })
    planosParaIndexar = dbPlanos.length > 0 ? dbPlanos : PLANOS_INFO.map(p => ({
      nome: p.nome,
      descricao: p.desc,
      valorMinimo: p.faixaPreco,
      valorMaximo: null,
      servicos: p.servicos,
    }))
  } catch {
    planosParaIndexar = PLANOS_INFO.map(p => ({
      nome: p.nome,
      descricao: p.desc,
      valorMinimo: p.faixaPreco,
      valorMaximo: null,
      servicos: p.servicos,
    }))
  }

  const texto = [
    'Planos de contabilidade disponíveis:',
    '',
    ...planosParaIndexar.map(p => {
      const servicos: string[] = Array.isArray(p.servicos) ? (p.servicos as string[]) : []
      const faixa = p.valorMaximo
        ? `R$ ${p.valorMinimo} – R$ ${p.valorMaximo}/mês`
        : `A partir de R$ ${p.valorMinimo}/mês`
      return [
        `## Plano ${p.nome}`,
        p.descricao ? `Descrição: ${p.descricao}` : '',
        `Preço: ${faixa}`,
        servicos.length ? `Serviços inclusos:\n${servicos.map(s => `- ${s}`).join('\n')}` : '',
      ].filter(Boolean).join('\n')
    }),
  ].join('\n\n')

  await indexar(texto, {
    escopo: 'global',
    canal: 'geral',
    tipo: 'base_conhecimento',
    documentoId: 'planos:v1',
    titulo: 'Planos e preços do escritório',
  }, keys)
}
