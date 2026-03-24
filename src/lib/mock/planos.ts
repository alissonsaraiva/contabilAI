import type { PlanoTipo } from '@/types'

export type PlanoMock = {
  tipo: PlanoTipo
  nome: string
  descricao: string
  valorMinimo: number
  valorMaximo: number
  servicos: string[]
  destaque: boolean
}

export const mockPlanos: PlanoMock[] = [
  {
    tipo: 'essencial',
    nome: 'Essencial',
    descricao: 'Ideal para MEI e microempresas',
    valorMinimo: 179,
    valorMaximo: 299,
    servicos: [
      'Obrigações fiscais acessórias',
      'Geração de DAS automática',
      'Portal básico do cliente',
      'Chatbot de dúvidas 24h',
      'Alertas de prazo por WhatsApp',
    ],
    destaque: false,
  },
  {
    tipo: 'profissional',
    nome: 'Profissional',
    descricao: 'Para empresas do Simples Nacional',
    valorMinimo: 449,
    valorMaximo: 699,
    servicos: [
      'Tudo do Essencial',
      'Departamento pessoal (até 3 funcionários)',
      'DRE simplificado mensal',
      'Fluxo de caixa',
      'Relatório narrativo com IA',
    ],
    destaque: true,
  },
  {
    tipo: 'empresarial',
    nome: 'Empresarial',
    descricao: 'Para Lucro Presumido e Real',
    valorMinimo: 990,
    valorMaximo: 1800,
    servicos: [
      'Tudo do Profissional',
      'Departamento pessoal ilimitado',
      'KPIs avançados e dashboards',
      'Consultoria mensal de 1h',
      'Simulação de cenários tributários',
    ],
    destaque: false,
  },
  {
    tipo: 'startup',
    nome: 'Startup',
    descricao: 'Para empresas digitais em crescimento',
    valorMinimo: 1200,
    valorMaximo: 2500,
    servicos: [
      'Tudo do Empresarial',
      'Relatórios para investidores',
      'Benchmark setorial com IA',
      'Suporte prioritário',
      'Planejamento tributário estratégico',
    ],
    destaque: false,
  },
]
