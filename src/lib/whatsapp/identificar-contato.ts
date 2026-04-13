/**
 * Resolução de contato WhatsApp → cliente/sócio/lead.
 *
 * Isolado do webhook/route.ts para ser testável e reutilizável.
 * O cache de telefone (phoneCache) permanece no webhook — aqui
 * fica apenas a consulta ao banco, sem estado em memória.
 */

import { prisma }         from '@/lib/prisma'
import { normalizarPhone } from '@/lib/utils/phone'

export async function buscarPorTelefone(phone: string): Promise<{
  clienteId?: string
  leadId?:    string
  socioId?:   string
}> {
  const variants = normalizarPhone(phone)
  if (!variants.length) return {}

  // Usa SQL bruto com regexp_replace para ignorar formatação (parênteses, hífens, espaços)
  // nos campos de telefone/whatsapp armazenados no banco (ex: "(85) 98118-6338" → "85981186338")

  // 1. Busca titular (cliente direto)
  const clienteRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM clientes
    WHERE regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = ANY(${variants})
       OR regexp_replace(COALESCE(whatsapp, ''), '[^0-9]', '', 'g') = ANY(${variants})
    LIMIT 1
  `
  if (clienteRows.length > 0) return { clienteId: clienteRows[0]!.id }

  // 2. Busca sócio — associado a uma empresa que tem cliente vinculado
  const socioRows = await prisma.$queryRaw<{ id: string; clienteId: string | null }[]>`
    SELECT s.id, e."clienteId"
    FROM socios s
    LEFT JOIN empresas e ON e.id = s."empresaId"
    WHERE regexp_replace(COALESCE(s.telefone, ''), '[^0-9]', '', 'g') = ANY(${variants})
       OR regexp_replace(COALESCE(s.whatsapp, ''), '[^0-9]', '', 'g') = ANY(${variants})
    LIMIT 1
  `
  if (socioRows.length > 0) {
    return {
      socioId:   socioRows[0]!.id,
      clienteId: socioRows[0]!.clienteId ?? undefined,
    }
  }

  // 3. Busca lead
  const leadRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM leads
    WHERE regexp_replace(COALESCE("contatoEntrada", ''), '[^0-9]', '', 'g') = ANY(${variants})
      AND status NOT IN ('cancelado', 'expirado', 'assinado')
    ORDER BY "criadoEm" DESC
    LIMIT 1
  `
  if (leadRows.length > 0) return { leadId: leadRows[0]!.id }

  return {}
}
