// Helper para calcular próximo disparo de uma expressão cron.
// Usa a lib `croner` para parsing preciso (suporta expressões padrão de 5 campos).
//
// Exemplos de expressões úteis:
//   "0 8 * * 1"       → toda segunda-feira às 08:00
//   "0 8 * * 1-5"     → dias úteis às 08:00
//   "0 9 1 * *"       → todo dia 1 do mês às 09:00
//   "0 8 * * *"       → todo dia às 08:00
//   "0 */2 * * *"     → a cada 2 horas

import { Cron } from 'croner'

/**
 * Calcula o próximo disparo após `from` (default: agora).
 * Retorna null se a expressão for inválida.
 */
export function proximoDisparo(cronExpr: string, from: Date = new Date()): Date | null {
  try {
    const job  = new Cron(cronExpr, { paused: true })
    const next = job.nextRun(from)
    return next ?? null
  } catch {
    return null
  }
}

/**
 * Converte uma descrição em linguagem natural para uma expressão cron.
 * Cobre os padrões mais comuns — o LLM pode usar como guia.
 */
export const CRON_EXEMPLOS: Record<string, string> = {
  'todo dia às 8h':              '0 8 * * *',
  'toda segunda às 8h':          '0 8 * * 1',
  'toda terça às 8h':            '0 8 * * 2',
  'toda quarta às 8h':           '0 8 * * 3',
  'toda quinta às 8h':           '0 8 * * 4',
  'toda sexta às 8h':            '0 8 * * 5',
  'dias úteis às 8h':            '0 8 * * 1-5',
  'toda semana segunda 9h':      '0 9 * * 1',
  'todo mês dia 1 às 8h':        '0 8 1 * *',
  'todo mês dia 5 às 8h':        '0 8 5 * *',
  'todo mês dia 10 às 8h':       '0 8 10 * *',
  'a cada hora':                 '0 * * * *',
}

/**
 * Valida se uma expressão cron é válida.
 */
export function validarCron(cronExpr: string): boolean {
  try {
    new Cron(cronExpr, { paused: true })
    return true
  } catch {
    return false
  }
}
