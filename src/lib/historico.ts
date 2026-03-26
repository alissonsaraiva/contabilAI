/**
 * Sistema central de histórico de atividades (activity log).
 *
 * Todas as escritas são fire-and-forget — nunca bloqueiam o caminho crítico.
 *
 * ## Adicionar novo tipo de evento (sem migration):
 * 1. Adicione a string ao union TipoEvento
 * 2. Adicione entrada em EVENTO_CONFIG com icon e label
 * 3. Crie uma função registrar<SuaFeature>() exportada
 * 4. Chame-a onde necessário — uma linha, sem .catch()
 */

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export type { TipoEvento } from '@/lib/historico-config'
export { EVENTO_CONFIG, getEventoConfig } from '@/lib/historico-config'
import type { TipoEvento } from '@/lib/historico-config'

// ─── Payload interno ──────────────────────────────────────────────────────────

type RegistrarParams = {
  tipo: TipoEvento
  origem: 'usuario' | 'ia' | 'agente' | 'sistema'
  clienteId?: string
  leadId?: string
  usuarioId?: string
  titulo?: string
  conteudo?: string
  metadados?: Record<string, unknown>
  escritorioEvento?: boolean
}

// Escrita interna — fire-and-forget via .catch()
function registrar(params: RegistrarParams): void {
  prisma.interacao
    .create({
      data: {
        tipo:             params.tipo,
        origem:           params.origem,
        escritorioEvento: params.escritorioEvento ?? false,
        clienteId:        params.clienteId,
        leadId:           params.leadId,
        usuarioId:        params.usuarioId,
        titulo:           params.titulo,
        conteudo:         params.conteudo,
        metadados:        params.metadados as Prisma.InputJsonValue ?? undefined,
      } as Prisma.InteracaoUncheckedCreateInput,
    })
    .catch(err => console.error('[historico] falha ao registrar evento:', params.tipo, err))
}

// ─── API pública por domínio ──────────────────────────────────────────────────

// ── Atendimentos ──────────────────────────────────────────────────────────────

export function registrarHumanoAssumiu(params: {
  conversaId: string
  operadorId: string
  operadorNome: string
  clienteId?: string
  leadId?: string
}): void {
  registrar({
    tipo: 'humano_assumiu',
    origem: 'usuario',
    clienteId: params.clienteId,
    leadId: params.leadId,
    usuarioId: params.operadorId,
    titulo: `Atendimento assumido por ${params.operadorNome}`,
    metadados: { conversaId: params.conversaId },
    escritorioEvento: true,
  })
}

export function registrarIaRetomada(params: {
  conversaId: string
  operadorId: string
  operadorNome?: string
  clienteId?: string
  leadId?: string
}): void {
  registrar({
    tipo: 'ia_retomada',
    origem: 'usuario',
    clienteId: params.clienteId,
    leadId: params.leadId,
    usuarioId: params.operadorId,
    titulo: 'Conversa devolvida para a IA',
    metadados: { conversaId: params.conversaId },
    escritorioEvento: false,
  })
}

// ── Agente operacional ────────────────────────────────────────────────────────

export function registrarAgenteExecutou(params: {
  tool: string
  resumo: string
  sucesso: boolean
  clienteId?: string
  leadId?: string
  duracaoMs: number
}): void {
  registrar({
    tipo: params.sucesso ? 'agente_executou' : 'agente_falhou',
    origem: 'agente',
    clienteId: params.clienteId,
    leadId: params.leadId,
    titulo: `Agente: ${params.tool}`,
    conteudo: params.resumo,
    metadados: { tool: params.tool, sucesso: params.sucesso, duracaoMs: params.duracaoMs },
    escritorioEvento: !params.sucesso, // falhas aparecem no feed global
  })
}

// ── Mudança de status ─────────────────────────────────────────────────────────

export function registrarMudancaStatus(params: {
  entidade: 'cliente' | 'lead'
  entidadeId: string
  statusAnterior: string
  statusNovo: string
  usuarioId?: string
}): void {
  registrar({
    tipo: `${params.entidade}_status_mudou`,
    origem: params.usuarioId ? 'usuario' : 'sistema',
    clienteId: params.entidade === 'cliente' ? params.entidadeId : undefined,
    leadId:    params.entidade === 'lead'    ? params.entidadeId : undefined,
    usuarioId: params.usuarioId,
    titulo: `Status alterado: ${params.statusAnterior} → ${params.statusNovo}`,
    metadados: { de: params.statusAnterior, para: params.statusNovo },
    escritorioEvento: false,
  })
}

// ── Nota / interação manual (compatível com NovaInteracaoDrawer) ──────────────

export function registrarNota(params: {
  tipo: TipoEvento
  titulo?: string
  conteudo?: string
  clienteId?: string
  leadId?: string
  usuarioId: string
  metadados?: Record<string, unknown>
}): void {
  registrar({ ...params, origem: 'usuario' })
}

// ── Eventos de entidade ───────────────────────────────────────────────────────

export function registrarClienteCriado(params: {
  clienteId: string
  clienteNome: string
  usuarioId?: string
}): void {
  registrar({
    tipo: 'cliente_criado',
    origem: params.usuarioId ? 'usuario' : 'sistema',
    clienteId: params.clienteId,
    usuarioId: params.usuarioId,
    titulo: `Cliente criado: ${params.clienteNome}`,
    escritorioEvento: true,
  })
}
