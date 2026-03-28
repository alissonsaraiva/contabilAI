import { prisma } from '@/lib/prisma'
import { formatDateTime } from '@/lib/utils'
import { CRON_EXEMPLOS } from '@/lib/ai/cron-helper'
import { AgendamentoToggle, AgendamentoDelete } from '@/components/crm/agendamento-actions'

/** Tenta traduzir uma expressão cron para linguagem natural. */
function cronLegivel(expr: string): string {
  // Busca reversa no dicionário de exemplos
  const encontrado = Object.entries(CRON_EXEMPLOS).find(([, v]) => v === expr)
  if (encontrado) return encontrado[0]

  // Fallback: interpretação simples dos campos
  const partes = expr.trim().split(/\s+/)
  if (partes.length !== 5) return expr
  const [minuto, hora, , , diaSem] = partes

  const horaNum  = hora  === '*' ? null : parseInt(hora)
  const minNum   = minuto === '0' ? '' : `:${minuto.padStart(2, '0')}`
  const horaFmt  = horaNum !== null ? `${horaNum}h${minNum}` : null

  const DIAS: Record<string, string> = {
    '0': 'domingo', '1': 'segunda', '2': 'terça', '3': 'quarta',
    '4': 'quinta',  '5': 'sexta',   '6': 'sábado',
    '1-5': 'dias úteis',
  }

  if (diaSem !== '*' && horaFmt) {
    const dia = DIAS[diaSem] ?? `dia ${diaSem}`
    return `toda ${dia} às ${horaFmt}`
  }
  if (horaFmt && diaSem === '*') {
    return `todo dia às ${horaFmt}`
  }
  return expr
}

/** Distância relativa amigável para datas futuras. */
function tempoRestante(data: Date | null): string {
  if (!data) return '—'
  const diff = data.getTime() - Date.now()
  if (diff < 0) return 'vencido'
  const min = Math.floor(diff / 60_000)
  if (min < 60) return `em ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `em ${h}h`
  const d = Math.floor(h / 24)
  return `em ${d} dia${d !== 1 ? 's' : ''}`
}

export default async function AgendamentosPage() {
  const agendamentos = await prisma.agendamentoAgente.findMany({
    orderBy: [{ ativo: 'desc' }, { proximoDisparo: 'asc' }],
  })

  const ativos   = agendamentos.filter(a => a.ativo).length
  const inativos = agendamentos.length - ativos
  const proximoGlobal = agendamentos.find(a => a.ativo && a.proximoDisparo)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-on-surface">Operações agendadas</h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Tarefas que o agente executa automaticamente em horários configurados
          </p>
        </div>
        {agendamentos.length > 0 && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-on-surface-variant">
              <span className="h-2 w-2 rounded-full bg-success" />
              <span className="font-medium text-on-surface">{ativos}</span>
              <span>ativo{ativos !== 1 ? 's' : ''}</span>
            </div>
            {inativos > 0 && (
              <div className="flex items-center gap-1.5 text-on-surface-variant">
                <span className="h-2 w-2 rounded-full bg-outline-variant" />
                <span className="font-medium text-on-surface">{inativos}</span>
                <span>pausado{inativos !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Próxima execução global */}
      {proximoGlobal?.proximoDisparo && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>alarm</span>
          <div className="text-sm">
            <span className="font-medium text-on-surface">Próxima execução:</span>
            <span className="ml-1.5 text-on-surface-variant">
              {proximoGlobal.descricao}
            </span>
            <span className="ml-2 font-semibold text-primary">
              {tempoRestante(proximoGlobal.proximoDisparo)} — {formatDateTime(proximoGlobal.proximoDisparo)}
            </span>
          </div>
        </div>
      )}

      {/* Lista de agendamentos */}
      {agendamentos.length === 0 ? (
        <div className="rounded-2xl border border-outline-variant/15 bg-surface-container">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="material-symbols-outlined text-[48px] mb-4 text-on-surface-variant/30">schedule</span>
            <p className="text-sm font-medium text-on-surface-variant">Nenhum agendamento configurado</p>
            <p className="mt-1.5 text-xs text-on-surface-variant/60 max-w-xs leading-relaxed">
              Peça ao agente no chat do CRM:<br />
              <span className="font-mono bg-surface-container-low px-2 py-0.5 rounded mt-1 inline-block">
                &ldquo;crie um agendamento para resumir o funil toda segunda às 8h&rdquo;
              </span>
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {agendamentos.map(ag => {
            const proximo      = ag.proximoDisparo
            const ultimo       = ag.ultimoDisparo
            const legivel      = cronLegivel(ag.cron)
            const tempoProx    = tempoRestante(proximo)
            const vencido      = proximo && proximo < new Date() && ag.ativo

            return (
              <div
                key={ag.id}
                className={`rounded-2xl border bg-card p-5 transition-colors ${
                  ag.ativo
                    ? 'border-outline-variant/15'
                    : 'border-outline-variant/10 opacity-60'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Ícone + status */}
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ag.ativo ? 'bg-primary/10' : 'bg-surface-container'}`}>
                    <span
                      className={`material-symbols-outlined text-[20px] ${ag.ativo ? 'text-primary' : 'text-on-surface-variant/40'}`}
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      schedule
                    </span>
                  </div>

                  {/* Conteúdo principal */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-on-surface">{ag.descricao}</span>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {legivel}
                      </span>
                      <span className="font-mono text-[10px] text-on-surface-variant/50 bg-surface-container-low px-1.5 py-0.5 rounded">
                        {ag.cron}
                      </span>
                    </div>

                    {/* Instrução */}
                    <p className="mt-1.5 text-xs text-on-surface-variant leading-relaxed line-clamp-2" title={ag.instrucao}>
                      <span className="text-on-surface-variant/50">Instrução: </span>
                      {ag.instrucao}
                    </p>

                    {/* Metadados */}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-on-surface-variant">
                      {/* Próximo disparo */}
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">alarm</span>
                        {ag.ativo && proximo ? (
                          <span className={vencido ? 'text-error font-medium' : ''}>
                            Próximo: <span className="font-medium text-on-surface">{tempoProx}</span>
                            <span className="ml-1 text-on-surface-variant/60">({formatDateTime(proximo)})</span>
                          </span>
                        ) : (
                          <span className="italic opacity-50">Próximo: —</span>
                        )}
                      </div>

                      {/* Último disparo */}
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">history</span>
                        {ultimo ? (
                          <span>Último: <span className="text-on-surface">{formatDateTime(ultimo)}</span></span>
                        ) : (
                          <span className="italic opacity-50">Nunca executado</span>
                        )}
                      </div>

                      {/* Criado por */}
                      {ag.criadoPorNome && (
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px]">person</span>
                          <span>{ag.criadoPorNome}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-3 shrink-0">
                    <AgendamentoToggle id={ag.id} ativo={ag.ativo} />
                    <AgendamentoDelete id={ag.id} descricao={ag.descricao} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Dica de como criar */}
      {agendamentos.length > 0 && (
        <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low/50 px-4 py-3 flex items-start gap-2">
          <span className="material-symbols-outlined text-[15px] text-on-surface-variant/50 mt-0.5">info</span>
          <p className="text-xs text-on-surface-variant/70 leading-relaxed">
            Para criar novos agendamentos, peça ao agente no chat do CRM:{' '}
            <span className="font-mono bg-surface-container px-1.5 py-0.5 rounded">
              &ldquo;crie um agendamento para [tarefa] [frequência]&rdquo;
            </span>
          </p>
        </div>
      )}
    </div>
  )
}
