/**
 * Stage 3 do pipeline webhook WhatsApp:
 * Identifica o contato pelo telefone e resolve/cria a conversa ativa.
 *
 * Responsabilidades:
 *   - Cache in-memory de identificação (phone → contexto)
 *   - Busca no banco via buscarPorTelefone
 *   - Cria/recupera conversaIA ativa via getOrCreateConversaWhatsapp
 *   - Verifica se a conversa está pausada (humano no controle)
 */

import { prisma } from '@/lib/prisma'
import { getOrCreateConversaWhatsapp } from '@/lib/ai/conversa'
import { buscarPorTelefone } from '@/lib/whatsapp/identificar-contato'
import { PHONE_CACHE_TTL_MS } from '@/lib/whatsapp/constants'
import type { ContatoResolvido } from './types'

type PhoneCacheEntry = {
  clienteId?: string
  leadId?: string
  socioId?: string
  tipo: 'cliente' | 'lead' | 'socio' | 'prospect' | 'desconhecido'
  conversaId?: string
  cachedAt: number
}

const phoneCache = new Map<string, PhoneCacheEntry>()

/**
 * Identifica o contato, resolve/cria a conversa e verifica se está pausada.
 */
export async function resolverContato(remoteJid: string): Promise<ContatoResolvido> {
  // ── Identificação do contato ────────────────────────────────────────────
  let cached = phoneCache.get(remoteJid)

  // Invalida cache expirado
  if (cached && Date.now() - cached.cachedAt > PHONE_CACHE_TTL_MS) {
    phoneCache.delete(remoteJid)
    cached = undefined
  }

  if (!cached) {
    const encontrado = await buscarPorTelefone(remoteJid)
    if (encontrado.socioId) {
      cached = {
        socioId:   encontrado.socioId,
        clienteId: encontrado.clienteId,
        tipo:      'socio',
        cachedAt:  Date.now(),
      }
    } else if (encontrado.clienteId) {
      cached = { clienteId: encontrado.clienteId, tipo: 'cliente', cachedAt: Date.now() }
    } else if (encontrado.leadId) {
      cached = { leadId: encontrado.leadId, tipo: 'lead', cachedAt: Date.now() }
    } else {
      cached = { tipo: 'desconhecido', cachedAt: Date.now() }
    }
    phoneCache.set(remoteJid, cached)
  }

  // ── Conversa persistida no banco ────────────────────────────────────────
  const conversaId = await getOrCreateConversaWhatsapp(remoteJid, {
    clienteId: cached.clienteId,
    leadId:    cached.leadId,
    socioId:   cached.socioId,
  })

  // Atualiza cache se o conversaId mudou
  if (cached.conversaId !== conversaId) {
    cached.conversaId = conversaId
    phoneCache.set(remoteJid, cached)
  }

  // ── Verifica se conversa está pausada ───────────────────────────────────
  const conversaRow = await prisma.conversaIA.findUnique({
    where: { id: conversaId },
    select: { pausadaEm: true },
  })

  return {
    clienteId: cached.clienteId,
    leadId:    cached.leadId,
    socioId:   cached.socioId,
    tipo:      cached.tipo,
    conversaId,
    pausada:   !!conversaRow?.pausadaEm,
  }
}
