/**
 * Ponto central de registro de ferramentas do AgenteOperacional.
 *
 * Para adicionar uma nova tool:
 *   1. Crie o arquivo em src/lib/ai/tools/<nome-da-tool>.ts
 *   2. Implemente a interface Tool (types.ts)
 *   3. Adicione o import abaixo — o efeito colateral do import registra a tool
 *
 * As tools são registradas no registry global via registrarTool() chamado
 * no final de cada módulo de tool.
 */

// ─── Tools internas — Leitura CRM ─────────────────────────────────────────────
import './buscar-dados-operador'
import './resumir-funil'
import './listar-leads-inativos'
import './buscar-dados-cliente'
import './listar-tarefas'
import './buscar-historico'
import './listar-planos'
import './resumo-dashboard'

// ─── Tools internas — Escrita CRM ─────────────────────────────────────────────
// criar-tarefa e concluir-tarefa deprecadas — usar criarOrdemServico
import './criar-tarefa'
import './concluir-tarefa'
import './criar-ordem-servico'
import './registrar-interacao'
import './atualizar-status-lead'
import './avancar-lead'
import './criar-lead'
import './criar-cliente'
import './convidar-socio-portal'

// ─── Tools de comunicação ─────────────────────────────────────────────────────
import './enviar-email'
import './listar-emails-pendentes'
import './enviar-whatsapp-cliente'
import './enviar-whatsapp-lead'
import './enviar-whatsapp-socio'
import './responder-escalacao'
import './buscar-documentos'
import './enviar-documento-whatsapp'

// ─── Tools de contrato ────────────────────────────────────────────────────────
import './gerar-contrato'
import './enviar-contrato'

// ─── Tools de agendamento ─────────────────────────────────────────────────────
import './criar-agendamento'
import './listar-agendamentos'
import './cancelar-agendamento'

// ─── Tools de consulta/relatórios ────────────────────────────────────────────
import './consultar-dados'
import './publicar-relatorio'

// ─── Tools do portal do cliente ───────────────────────────────────────────────
import './listar-ordens-servico'
import './responder-ordem-servico'
import './publicar-comunicado'
import './enviar-mensagem-portal'

// ─── Tools de documentos ──────────────────────────────────────────────────────
import './listar-documentos-pendentes'

// ─── Tools de email ───────────────────────────────────────────────────────────
import './classificar-email'

// ─── Tools de comunicação segmentada ─────────────────────────────────────────
import './enviar-comunicado-segmentado'

// ─── Tools externas (adicionar aqui quando implementadas) ─────────────────────
// import './consultar-cnpj'
// import './buscar-boleto'
// import './emitir-nfe'

export * from './registry'
export * from './types'
