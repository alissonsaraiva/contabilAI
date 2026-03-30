import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const buscarCnpjExternoTool: Tool = {
  definition: {
    name: 'buscarCnpjExterno',
    description: 'Consulta dados públicos de um CNPJ diretamente na Receita Federal via API pública. Retorna razão social, situação cadastral, CNAE principal, endereço, quadro societário e data de abertura. Use quando o operador perguntar sobre a situação cadastral de uma empresa ou precisar confirmar dados de CNPJ.',
    inputSchema: {
      type: 'object',
      properties: {
        cnpj: {
          type: 'string',
          description: 'CNPJ da empresa (com ou sem formatação: 12.345.678/0001-90 ou 12345678000190).',
        },
      },
      required: ['cnpj'],
    },
  },

  meta: {
    label: 'Consultar CNPJ externo',
    descricao: 'Consulta dados públicos de um CNPJ na Receita Federal (situação, CNAE, endereço, sócios).',
    categoria: 'Clientes',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const cnpjRaw = (input.cnpj as string | undefined)?.replace(/[.\-\/\s]/g, '')
    if (!cnpjRaw || cnpjRaw.length !== 14) {
      return { sucesso: false, erro: 'CNPJ inválido. Forneça 14 dígitos.', resumo: 'Consulta cancelada: CNPJ inválido.' }
    }

    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      const res = await fetch(`${baseUrl}/api/cnpj/${cnpjRaw}`, {
        signal: AbortSignal.timeout(10_000),
      })

      if (!res.ok) {
        if (res.status === 404) {
          return { sucesso: false, erro: 'CNPJ não encontrado na Receita Federal.', resumo: `CNPJ ${cnpjRaw} não encontrado.` }
        }
        return { sucesso: false, erro: `Erro ao consultar CNPJ: HTTP ${res.status}.`, resumo: 'Falha na consulta do CNPJ.' }
      }

      const data = await res.json()

      const situacao = data.situacao_cadastral ?? data.situacao ?? 'não informada'
      const razaoSocial = data.razao_social ?? data.nome ?? 'não informada'
      const cnae = data.cnae_fiscal_descricao ?? data.atividade_principal?.[0]?.text ?? 'não informado'
      const endereco = [
        data.logradouro,
        data.numero,
        data.complemento,
        data.bairro,
        data.municipio,
        data.uf,
      ].filter(Boolean).join(', ')

      const socios = (data.qsa ?? []).slice(0, 5).map((s: any) =>
        `${s.nome_socio ?? s.nome} (${s.qualificacao_socio ?? s.qual ?? 'sócio'})`
      ).join('; ')

      const linhas = [
        `CNPJ: ${cnpjRaw}`,
        `Razão Social: ${razaoSocial}`,
        `Situação Cadastral: ${situacao}`,
        `CNAE Principal: ${cnae}`,
        endereco ? `Endereço: ${endereco}` : '',
        data.data_inicio_atividade ? `Abertura: ${data.data_inicio_atividade}` : '',
        socios ? `Sócios: ${socios}` : '',
      ].filter(Boolean).join('\n')

      return { sucesso: true, dados: data, resumo: linhas }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { sucesso: false, erro: msg, resumo: `Erro ao consultar CNPJ: ${msg}` }
    }
  },
}

registrarTool(buscarCnpjExternoTool)
