import { prisma } from '@/lib/prisma'
import { formatDateTime } from '@/lib/utils'
import '@/lib/ai/tools' // registra todas as tools no registry
import { getCapacidades } from '@/lib/ai/tools/registry'

const FEATURE_LABELS: Record<string, string> = {
  crm:        'CRM',
  whatsapp:   'WhatsApp',
  onboarding: 'Onboarding',
  portal:     'Portal',
}

type Props = {
  searchParams: Promise<{ page?: string; tool?: string; solicitante?: string; sucesso?: string }>
}

export default async function LogsPage({ searchParams }: Props) {
  const sp         = await searchParams
  const page       = Math.max(1, parseInt(sp.page ?? '1'))
  const limit      = 50
  const skip       = (page - 1) * limit
  const filterTool = sp.tool        ?? undefined
  const filterFeat = sp.solicitante ?? undefined
  const filterOk   = sp.sucesso     ?? undefined

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
        usuarioNome:   true,
        usuarioTipo:   true,
        clienteId:     true,
        leadId:        true,
        criadoEm:      true,
        resultado:     true,
        input:         true,
      },
    }),
    prisma.agenteAcao.count({ where }),
  ])

  const totalPages = Math.ceil(total / limit)

  // Resolve nomes de clientes/leads
  const clienteIds = [...new Set(acoes.map(a => a.clienteId).filter(Boolean))] as string[]
  const leadIds    = [...new Set(acoes.map(a => a.leadId).filter(Boolean))]    as string[]

  const [clientes, leads] = await Promise.all([
    clienteIds.length > 0
      ? prisma.cliente.findMany({ where: { id: { in: clienteIds } }, select: { id: true, nome: true, empresa: { select: { razaoSocial: true } } } })
      : [],
    leadIds.length > 0
      ? prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, contatoEntrada: true, dadosJson: true } })
      : [],
  ])

  const clienteMap = Object.fromEntries(clientes.map(c => [c.id, c.empresa?.razaoSocial ?? c.nome ?? 'Cliente']))
  const leadMap    = Object.fromEntries(leads.map(l => {
    const dados = (l.dadosJson ?? {}) as Record<string, string>
    const nome  = dados['Nome completo'] ?? dados['Razão Social'] ?? l.contatoEntrada ?? 'Lead'
    return [l.id, nome]
  }))

  // Tools do registry para o dropdown (dinâmico — sempre atualizado)
  const capacidades = getCapacidades()

  // Estatísticas rápidas para o header
  const totalErros   = await prisma.agenteAcao.count({ where: { sucesso: false } })
  const totalSucesso = await prisma.agenteAcao.count({ where: { sucesso: true } })

  const buildQuery = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams()
    const merged = { solicitante: filterFeat, tool: filterTool, sucesso: filterOk, ...overrides }
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== '') params.set(k, v)
    }
    return params.toString() ? `?${params.toString()}` : ''
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-on-surface">Logs de execução</h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Registro de todas as ações executadas pelas IAs
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-on-surface-variant">
            <span className="material-symbols-outlined text-[15px] text-success" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            <span className="tabular-nums font-medium text-on-surface">{totalSucesso.toLocaleString('pt-BR')}</span>
            <span>ok</span>
          </div>
          <div className="flex items-center gap-1.5 text-on-surface-variant">
            <span className="material-symbols-outlined text-[15px] text-error" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
            <span className="tabular-nums font-medium text-on-surface">{totalErros.toLocaleString('pt-BR')}</span>
            <span>erro{totalErros !== 1 ? 's' : ''}</span>
          </div>
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
          {capacidades.map(c => (
            <option key={c.tool} value={c.tool}>{c.label}</option>
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

        {(filterFeat || filterTool || filterOk) && (
          <a
            href="/crm/configuracoes/ia/logs"
            className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            Limpar
          </a>
        )}

        <span className="ml-auto self-center text-xs text-on-surface-variant">
          {total.toLocaleString('pt-BR')} registro{total !== 1 ? 's' : ''}
          {(filterFeat || filterTool || filterOk) ? ' (filtrado)' : ''}
        </span>
      </form>

      {/* Tabela */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container overflow-hidden">
        {acoes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
            <span className="material-symbols-outlined text-[48px] mb-3 opacity-30">history</span>
            <p className="text-sm">Nenhum log encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low">
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Tool</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Origem</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Operador</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Contexto</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Input</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Resultado</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Duração</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant whitespace-nowrap">Data / Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {acoes.map(acao => {
                  const res          = acao.resultado as Record<string, unknown> | null
                  const resumo       = typeof res?.resumo === 'string' ? res.resumo : ''
                  const erro         = typeof res?.erro   === 'string' ? res.erro   : ''
                  const inputStr     = acao.input ? JSON.stringify(acao.input, null, 0) : ''
                  const nomeContexto = acao.clienteId
                    ? clienteMap[acao.clienteId]
                    : acao.leadId ? leadMap[acao.leadId] : null
                  const toolLabel    = capacidades.find(c => c.tool === acao.tool)?.label ?? acao.tool

                  return (
                    <tr key={acao.id} className={`hover:bg-surface-container-high/50 transition-colors ${!acao.sucesso ? 'bg-error/3' : ''}`}>

                      {/* Tool */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${acao.sucesso ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'}`}>
                          <span className="material-symbols-outlined text-[13px]">build</span>
                          {toolLabel}
                        </span>
                      </td>

                      {/* Origem */}
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-surface-container-low px-2 py-0.5 text-xs font-medium text-on-surface-variant">
                          {FEATURE_LABELS[acao.solicitanteAI] ?? acao.solicitanteAI}
                        </span>
                      </td>

                      {/* Operador */}
                      <td className="px-4 py-3 text-xs">
                        {acao.usuarioNome ? (
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[13px] text-on-surface-variant">person</span>
                            <span className="text-on-surface">{acao.usuarioNome}</span>
                            {acao.usuarioTipo && (
                              <span className="rounded-full bg-surface-container px-1.5 py-0.5 text-[10px] text-on-surface-variant">{acao.usuarioTipo}</span>
                            )}
                          </div>
                        ) : (
                          <span className="italic opacity-40">automático</span>
                        )}
                      </td>

                      {/* Contexto */}
                      <td className="px-4 py-3 text-xs text-on-surface-variant">
                        {nomeContexto ?? <span className="italic opacity-50">—</span>}
                      </td>

                      {/* Input */}
                      <td className="px-4 py-3 max-w-[160px]">
                        {inputStr ? (
                          <span
                            title={JSON.stringify(acao.input, null, 2)}
                            className="block font-mono text-[10px] text-on-surface-variant truncate cursor-help"
                          >
                            {inputStr}
                          </span>
                        ) : (
                          <span className="italic opacity-40 text-xs">—</span>
                        )}
                      </td>

                      {/* Resultado */}
                      <td className="px-4 py-3 max-w-xs">
                        {acao.sucesso ? (
                          <div className="flex items-start gap-1.5">
                            <span className="material-symbols-outlined text-[14px] text-success mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                            <span className="text-xs text-on-surface line-clamp-2">{resumo}</span>
                          </div>
                        ) : (
                          <div className="flex items-start gap-1.5">
                            <span className="material-symbols-outlined text-[14px] text-error mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
                            <span className="text-xs text-error line-clamp-3" title={erro || resumo}>{erro || resumo || 'Falhou'}</span>
                          </div>
                        )}
                      </td>

                      {/* Duração */}
                      <td className="px-4 py-3 text-xs text-on-surface-variant tabular-nums">
                        {acao.duracaoMs < 1000
                          ? `${acao.duracaoMs}ms`
                          : `${(acao.duracaoMs / 1000).toFixed(1)}s`}
                      </td>

                      {/* Data / Hora */}
                      <td className="px-4 py-3 text-xs text-on-surface-variant tabular-nums whitespace-nowrap">
                        {formatDateTime(acao.criadoEm)}
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
                href={`${buildQuery({ page: String(page - 1) })}`}
                className="rounded-lg border border-outline-variant px-3 py-1.5 text-on-surface hover:bg-surface-container transition-colors"
              >
                ← Anterior
              </a>
            )}
            {page < totalPages && (
              <a
                href={`${buildQuery({ page: String(page + 1) })}`}
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
