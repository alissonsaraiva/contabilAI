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
import './criar-tarefa'
import './concluir-tarefa'
import './registrar-interacao'
import './atualizar-status-lead'
import './avancar-lead'
import './criar-lead'
import './criar-cliente'
import './convidar-socio-portal'

// ─── Tools de comunicação ─────────────────────────────────────────────────────
import './enviar-email'
import './enviar-whatsapp-cliente'
import './enviar-whatsapp-lead'
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

// ─── Tools externas (adicionar aqui quando implementadas) ─────────────────────
// import './consultar-cnpj'
// import './buscar-boleto'
// import './emitir-nfe'

export * from './registry'
export * from './types'
