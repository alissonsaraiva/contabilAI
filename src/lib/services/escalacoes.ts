/**
 * criarEscalacao — service centralizado para criação de escalações.
 *
 * Substitui prisma.escalacao.create() inline em 7 locais com estruturas diferentes.
 * Garante: criação consistente + notificação CRM + indexação RAG.
 */

import { prisma } from '@/lib/prisma'
import { indexarAsync } from '@/lib/rag/indexar-async'
import type { CanalEscalacao } from '@prisma/client'

export type CriarEscalacaoInput = {
  canal:           CanalEscalacao
  clienteId?:      string
  leadId?:         string
  conversaIAId?:   string
  remoteJid?:      string
  sessionId?:      string
  historico:       Array<{ role: string; content: string }>
  ultimaMensagem:  string
  motivoIA?:       string
}

export async function criarEscalacao(input: CriarEscalacaoInput): Promise<string> {
  const escalacao = await prisma.escalacao.create({
    data: {
      canal:          input.canal,
      status:         'pendente',
      clienteId:      input.clienteId  ?? null,
      leadId:         input.leadId     ?? null,
      conversaIAId:   input.conversaIAId ?? null,
      remoteJid:      input.remoteJid  ?? null,
      sessionId:      input.sessionId  ?? null,
      historico:      input.historico  as object[],
      ultimaMensagem: input.ultimaMensagem,
      motivoIA:       input.motivoIA   ?? null,
    },
  })

  // Notifica equipe de atendimento no CRM
  import('@/lib/notificacoes')
    .then(({ notificarEscalacaoPortal }) =>
      notificarEscalacaoPortal(input.clienteId ?? '', escalacao.id)
    )
    .catch(() => {})

  // Indexa no RAG
  indexarAsync('escalacao', {
    id:             escalacao.id,
    canal:          input.canal,
    clienteId:      input.clienteId,
    leadId:         input.leadId,
    ultimaMensagem: input.ultimaMensagem,
    motivoIA:       input.motivoIA,
    criadoEm:       escalacao.criadoEm,
  })

  return escalacao.id
}
