/**
 * registrarInteracao — service centralizado para criação de interações.
 *
 * Substitui prisma.interacao.create() inline em 13+ locais.
 * Garante consistência de campos, origem e indexação RAG automática.
 */

import { prisma } from '@/lib/prisma'
import { indexarAsync } from '@/lib/rag/indexar-async'

export type RegistrarInteracaoInput = {
  tipo:              string          // 'email_enviado' | 'whatsapp_enviado' | 'tarefa_criada' | etc.
  titulo?:           string
  conteudo?:         string
  clienteId?:        string
  leadId?:           string
  usuarioId?:        string
  origem?:           string          // 'usuario' | 'ia' | 'agente' | 'sistema' (default: 'sistema')
  escritorioEvento?: boolean         // aparece no feed global do dashboard
  metadados?:        Record<string, unknown>
}

export async function registrarInteracao(input: RegistrarInteracaoInput): Promise<string> {
  const interacao = await prisma.interacao.create({
    data: {
      tipo:              input.tipo,
      titulo:            input.titulo,
      conteudo:          input.conteudo,
      clienteId:         input.clienteId,
      leadId:            input.leadId,
      usuarioId:         input.usuarioId,
      origem:            input.origem ?? 'sistema',
      escritorioEvento:  input.escritorioEvento ?? false,
      metadados:         input.metadados as never,
    },
  })

  // Indexa no RAG de forma assíncrona — nunca bloqueia
  if (input.clienteId || input.leadId) {
    indexarAsync('interacao', {
      id:        interacao.id,
      clienteId: input.clienteId,
      leadId:    input.leadId,
      tipo:      input.tipo,
      titulo:    input.titulo,
      conteudo:  input.conteudo,
      criadoEm:  interacao.criadoEm,
    })
  }

  return interacao.id
}
