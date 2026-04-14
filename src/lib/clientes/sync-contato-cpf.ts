import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'

// Campos de contato sincronizados entre sócio e cliente quando compartilham CPF
const SYNC_FIELDS = ['email', 'telefone', 'whatsapp'] as const

/**
 * Sincroniza dados de contato do sócio → cliente (e outros sócios com mesmo CPF).
 * Chamada após PATCH/POST de sócio.
 * Só propaga valores não-vazios (evita limpar dados do cliente).
 */
export async function syncSocioParaCliente(
  cpf: string,
  dados: { email?: string | null; telefone?: string | null; whatsapp?: string | null },
  socioOrigemId: string,
) {
  if (!cpf) return
  const cpfLimpo = cpf.replace(/\D/g, '')
  if (cpfLimpo.length < 11) return

  // Build update data - only non-empty values
  const updateData: Record<string, string> = {}
  for (const field of SYNC_FIELDS) {
    const val = dados[field]
    if (val && val.trim()) updateData[field] = val.trim()
  }
  if (Object.keys(updateData).length === 0) return

  try {
    // Sync to cliente
    await prisma.cliente.updateMany({
      where: { cpf: cpfLimpo },
      data: updateData,
    }).catch((err: unknown) => {
      // P2002 = unique constraint (email) - log but don't throw
      if (err && typeof err === 'object' && 'code' in err && (err as { code: unknown }).code === 'P2002') {
        console.warn('[sync-contato] email unique conflict ao sincronizar sócio→cliente, ignorando:', { cpf: cpfLimpo })
        // Retry without email
        const { email: _email, ...semEmail } = updateData
        if (Object.keys(semEmail).length > 0) {
          return prisma.cliente.updateMany({ where: { cpf: cpfLimpo }, data: semEmail })
        }
      } else {
        throw err
      }
    })

    // Sync to other socios with same CPF
    await prisma.socio.updateMany({
      where: { cpf: cpfLimpo, id: { not: socioOrigemId } },
      data: updateData,
    })
  } catch (err) {
    console.error('[sync-contato] erro ao sincronizar sócio→cliente:', { cpf: cpfLimpo, err })
    Sentry.captureException(err, {
      tags: { module: 'sync-contato', operation: 'socio-para-cliente' },
      extra: { cpf: cpfLimpo, socioOrigemId },
    })
  }
}

/**
 * Sincroniza dados de contato do cliente → todos os sócios com mesmo CPF.
 * Chamada após PUT de cliente.
 */
export async function syncClienteParaSocios(
  cpf: string,
  dados: { email?: string | null; telefone?: string | null; whatsapp?: string | null },
) {
  if (!cpf) return
  const cpfLimpo = cpf.replace(/\D/g, '')
  if (cpfLimpo.length < 11) return

  const updateData: Record<string, string | null> = {}
  for (const field of SYNC_FIELDS) {
    if (field in dados) {
      updateData[field] = dados[field]?.trim() || null
    }
  }
  if (Object.keys(updateData).length === 0) return

  try {
    await prisma.socio.updateMany({
      where: { cpf: cpfLimpo },
      data: updateData,
    })
  } catch (err) {
    console.error('[sync-contato] erro ao sincronizar cliente→sócios:', { cpf: cpfLimpo, err })
    Sentry.captureException(err, {
      tags: { module: 'sync-contato', operation: 'cliente-para-socios' },
      extra: { cpf: cpfLimpo },
    })
  }
}
