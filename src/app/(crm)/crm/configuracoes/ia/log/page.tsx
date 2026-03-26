import { prisma } from '@/lib/prisma'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'

const FEATURE_LABELS: Record<string, string> = {
  crm:        'CRM',
  whatsapp:   'WhatsApp',
  onboarding: 'Onboarding',
  portal:     'Portal',
}

const TOOL_LABELS: Record<string, string> = {
  resumirFunil:          'Resumir funil',
  listarLeadsInativos:   'Leads inativos',
  buscarDadosCliente:    'Dados do cliente',
  listarTarefas:         'Listar tarefas',
  criarTarefa:           'Criar tarefa',
  registrarInteracao:    'Registrar interação',
  atualizarStatusLead:   'Atualizar lead',
}

type Props = {
  searchParams: Promise<{ page?: string; tool?: string; solicitante?: string; sucesso?: string }>
}

export default async function AgentePage({ searchParams }: Props) {
  const sp          = await searchParams
  const page        = Math.max(1, parseInt(sp.page ?? '1'))
  const limit       = 50
  const skip        = (page - 1) * limit
  const filterTool  = sp.tool        ?? undefined
  const filterFeat  = sp.solicitante ?? undefined
  const filterOk    = sp.sucesso     ?? undefined

  const where = {
    ...(filterTool && { tool: filterTool }),
    ...(filterFeat && { solicitanteAI: filterFeat }),
    ...(filterOk !== undefined && filterOk !== '' && { sucesso: filterOk === 'true' }),
  }

  const [acoes, total] = await Promise.all([
    prisma.agenteAcao.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip,
      take: limit,
      select: {
        id:            true,
        tool:          true,
        sucesso:       true,
        duracaoMs:     true,
        solicitanteAI: true,
        clienteId:     true,
        leadId:        true,
        criadoEm:      true,
        resultado:     true,
      },
    }),
    prisma.agenteAcao.count({ where }),
  ])

  const totalPages = Math.ceil(total / limit)

  // Resolve nomes de clientes/leads nas ações
  const clienteIds = [...new Set(acoes.map(a => a.clienteId).filter(Boolean))] as string[]
  const leadIds    = [...new Set(acoes.map(a => a.leadId).filter(Boolean))]    as string[]

  const [clientes, leads] = await Promise.all([
    clienteIds.length > 0
      ? prisma.cliente.findMany({ where: { id: { in: clienteIds } }, select: { id: true, nome: true, razaoSocial: true } })
      : [],
    leadIds.length > 0
      ? prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, contatoEntrada: true, dadosJson: true } })
      : [],
  ])

  const clienteMap = Object.fromEntries(clientes.map(c => [c.id, c.razaoSocial ?? c.nome ?? 'Cliente']))
  const leadMap    = Object.fromEntries(leads.map(l => {
    const dados = (l.dadosJson ?? {}) as Record<string, string>
    const nome  = dados['Nome completo'] ?? dados['Razão Social'] ?? l.contatoEntrada ?? 'Lead'
    return [l.id, nome]
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-on-surface">Agente Operacional</h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Log de ações executadas pelo agente de IA
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px]">history</span>
          <span>{total} ação{total !== 1 ? 'ões' : ''} registrada{total !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Filtros */}
      <form method="GET" className="flex flex-wrap gap-3">
        <select
          name="solicitante"
          defaultValue={filterFeat ?? ''}
          className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Todas as IAs</option>
          <option value="crm">CRM</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="onboarding">Onboarding</option>
          <option value="portal">Portal</option>
        </select>

        <select
          name="tool"
          defaultValue={filterTool ?? ''}
          className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Todas as tools</option>
          {Object.entries(TOOL_LABELS).map(([val, lbl]) => (
            <option key={val} value={val}>{lbl}</option>
          ))}
        </select>

        <select
          name="sucesso"
          defaultValue={filterOk ?? ''}
          className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Todos os resultados</option>
          <option value="true">Sucesso</option>
          <option value="false">Falhou</option>
        </select>

        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          Filtrar
        </button>

        {(filterFeat || filterTool || filterOk !== undefined) && (
          <a
            href="/crm/agente"
            className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            Limpar
          </a>
        )}
      </form>

      {/* Tabela */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container overflow-hidden">
        {acoes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
            <span className="material-symbols-outlined text-[48px] mb-3 opacity-30">smart_toy</span>
            <p className="text-sm">Nenhuma ação registrada</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low">
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Tool</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Origem</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Contexto</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Resultado</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Duração</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {acoes.map(acao => {
                  const res = acao.resultado as Record<string, unknown> | null
                  const resumo = typeof res?.resumo === 'string' ? res.resumo : ''
                  const erro   = typeof res?.erro   === 'string' ? res.erro   : ''
                  const nomeContexto = acao.clienteId
                    ? clienteMap[acao.clienteId]
                    : acao.leadId
                      ? leadMap[acao.leadId]
                      : null

                  return (
                    <tr key={acao.id} className="hover:bg-surface-container-high/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          <span className="material-symbols-outlined text-[13px]">build</span>
                          {TOOL_LABELS[acao.tool] ?? acao.tool}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span className="rounded-md bg-surface-container-low px-2 py-0.5 text-xs font-medium text-on-surface-variant">
                          {FEATURE_LABELS[acao.solicitanteAI] ?? acao.solicitanteAI}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-on-surface-variant text-xs">
                        {nomeContexto ?? (
                          <span className="italic opacity-50">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 max-w-xs">
                        {acao.sucesso ? (
                          <div className="flex items-start gap-1.5">
                            <span className="material-symbols-outlined text-[14px] text-success mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                            <span className="text-xs text-on-surface line-clamp-2">{resumo}</span>
                          </div>
                        ) : (
                          <div className="flex items-start gap-1.5">
                            <span className="material-symbols-outlined text-[14px] text-error mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
                            <span className="text-xs text-error line-clamp-2">{erro || resumo || 'Falhou'}</span>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-xs text-on-surface-variant tabular-nums">
                        {acao.duracaoMs < 1000
                          ? `${acao.duracaoMs}ms`
                          : `${(acao.duracaoMs / 1000).toFixed(1)}s`}
                      </td>

                      <td className="px-4 py-3 text-xs text-on-surface-variant tabular-nums whitespace-nowrap">
                        {formatDate(acao.criadoEm)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-on-surface-variant">
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`?page=${page - 1}${filterFeat ? `&solicitante=${filterFeat}` : ''}${filterTool ? `&tool=${filterTool}` : ''}${filterOk !== undefined ? `&sucesso=${filterOk}` : ''}`}
                className="rounded-lg border border-outline-variant px-3 py-1.5 text-on-surface hover:bg-surface-container transition-colors"
              >
                ← Anterior
              </a>
            )}
            {page < totalPages && (
              <a
                href={`?page=${page + 1}${filterFeat ? `&solicitante=${filterFeat}` : ''}${filterTool ? `&tool=${filterTool}` : ''}${filterOk !== undefined ? `&sucesso=${filterOk}` : ''}`}
                className="rounded-lg border border-outline-variant px-3 py-1.5 text-on-surface hover:bg-surface-container transition-colors"
              >
                Próxima →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
