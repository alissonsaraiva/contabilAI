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
import './resumir-funil'
import './listar-leads-inativos'
import './buscar-dados-cliente'
import './listar-tarefas'

// ─── Tools internas — Escrita CRM ─────────────────────────────────────────────
import './criar-tarefa'
import './registrar-interacao'
import './atualizar-status-lead'

// ─── Tools externas (adicionar aqui quando implementadas) ─────────────────────
// import './consultar-cnpj'
// import './buscar-boleto'
// import './emitir-nfe'

export * from './registry'
export * from './types'
