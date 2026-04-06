/**
 * limite-mei.ts
 *
 * Calcula o faturamento acumulado de um MEI no ano com base nas
 * Notas Fiscais de Serviço (NFS-e) autorizadas e não canceladas.
 *
 * Limite vigente: R$ 81.000/ano (MEI padrão).
 * Notas canceladas (canceladaEm != null) são excluídas do cálculo.
 *
 * Fonte de dados: tabela NotaFiscal — apenas status='autorizada' e canceladaEm=null.
 * Receitas sem NF não são computadas automaticamente.
 */
import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'

export const LIMITE_MEI = 81_000

export const THRESHOLD_AMARELO  = 0.75  // 75%
export const THRESHOLD_VERMELHO = 0.90  // 90%

export type ZonaLimiteMEI = 'verde' | 'amarelo' | 'vermelho'

export type PorMesLimiteMEI = {
  mes: number   // 1–12
  ano: number
  total: number // soma das NF-e autorizadas no mês
}

export type LimiteMEIResult = {
  acumulado:  number
  limite:     number
  percentual: number           // 0–100 (pode ultrapassar 100 se acima do limite)
  zona:       ZonaLimiteMEI
  restante:   number           // 0 quando acima do limite
  ano:        number
  porMes:     PorMesLimiteMEI[]
}

/**
 * Calcula o faturamento MEI acumulado via NFS-e para uma empresa.
 *
 * @param empresaId ID da Empresa (não do Cliente)
 * @param ano       Ano fiscal — padrão: ano corrente
 */
export async function calcularLimiteMEI(
  empresaId: string,
  ano?: number,
): Promise<LimiteMEIResult> {
  const anoRef  = ano ?? new Date().getFullYear()
  const inicio  = new Date(anoRef, 0, 1)          // 01/01/anoRef 00:00
  const fim     = new Date(anoRef + 1, 0, 1)      // 01/01/anoRef+1 00:00

  try {
    const notas = await prisma.notaFiscal.findMany({
      where: {
        empresaId,
        status:      'autorizada',
        canceladaEm: null,            // exclui notas canceladas
        autorizadaEm: {
          gte: inicio,
          lt:  fim,
        },
      },
      select: {
        valorTotal:   true,
        autorizadaEm: true,
      },
    })

    const porMesMap = new Map<number, number>()
    let acumulado = 0

    for (const nota of notas) {
      const valor = Number(nota.valorTotal)
      acumulado  += valor

      if (nota.autorizadaEm) {
        const mes = nota.autorizadaEm.getMonth() + 1   // 1-based
        porMesMap.set(mes, (porMesMap.get(mes) ?? 0) + valor)
      }
    }

    const porMes: PorMesLimiteMEI[] = Array.from(porMesMap.entries())
      .map(([mes, total]) => ({ mes, ano: anoRef, total }))
      .sort((a, b) => a.mes - b.mes)

    const percentual = (acumulado / LIMITE_MEI) * 100
    const restante   = Math.max(LIMITE_MEI - acumulado, 0)

    let zona: ZonaLimiteMEI
    if (percentual >= THRESHOLD_VERMELHO * 100) zona = 'vermelho'
    else if (percentual >= THRESHOLD_AMARELO * 100)  zona = 'amarelo'
    else zona = 'verde'

    return {
      acumulado,
      limite:     LIMITE_MEI,
      percentual: Math.min(percentual, 100),   // cap em 100% para a barra visual
      zona,
      restante,
      ano:        anoRef,
      porMes,
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags:  { module: 'limite-mei', operation: 'calcularLimiteMEI' },
      extra: { empresaId, ano: anoRef },
    })
    throw err
  }
}
