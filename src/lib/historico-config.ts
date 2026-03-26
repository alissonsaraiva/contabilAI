/**
 * Configurações de tipos de evento — sem dependência de servidor.
 * Importável em Client Components.
 */

export type TipoEvento =
  | 'whatsapp_enviado'
  | 'email_enviado'
  | 'email_recebido'
  | 'ligacao'
  | 'nota_interna'
  | 'status_mudou'
  | 'contrato_gerado'
  | 'contrato_assinado'
  | 'documento_enviado'
  | 'tarefa_criada'
  | 'tarefa_concluida'
  | 'cliente_ativado'
  | 'ia_escalada'
  | 'humano_assumiu'
  | 'humano_respondeu'
  | 'ia_retomada'
  | 'escalacao_resolvida'
  | 'agente_executou'
  | 'agente_falhou'
  | 'lead_status_mudou'
  | 'cliente_status_mudou'
  | 'cliente_criado'
  | (string & {})

export const EVENTO_CONFIG: Record<string, { icon: string; label: string; cor?: string }> = {
  whatsapp_enviado:    { icon: 'chat',              label: 'WhatsApp enviado' },
  email_enviado:       { icon: 'mail',              label: 'E-mail enviado' },
  email_recebido:      { icon: 'mark_email_unread', label: 'E-mail recebido' },
  ligacao:             { icon: 'call',              label: 'Ligação' },
  nota_interna:        { icon: 'sticky_note_2',     label: 'Nota interna' },
  status_mudou:        { icon: 'swap_horiz',        label: 'Status alterado' },
  contrato_gerado:     { icon: 'description',       label: 'Contrato gerado' },
  contrato_assinado:   { icon: 'verified',          label: 'Contrato assinado' },
  documento_enviado:   { icon: 'upload_file',       label: 'Documento enviado' },
  tarefa_criada:       { icon: 'task_alt',          label: 'Tarefa criada' },
  tarefa_concluida:    { icon: 'check_circle',      label: 'Tarefa concluída',         cor: 'text-green-status' },
  cliente_ativado:     { icon: 'person_check',      label: 'Cliente ativado',          cor: 'text-green-status' },
  ia_escalada:         { icon: 'support_agent',     label: 'Escalado para humano',     cor: 'text-orange-status' },
  humano_assumiu:      { icon: 'manage_accounts',   label: 'Atendimento assumido' },
  humano_respondeu:    { icon: 'manage_accounts',   label: 'Respondido por operador' },
  ia_retomada:         { icon: 'smart_toy',         label: 'Devolvido para IA' },
  escalacao_resolvida: { icon: 'check_circle',      label: 'Atendimento resolvido',    cor: 'text-green-status' },
  agente_executou:     { icon: 'build',             label: 'Ação do agente' },
  agente_falhou:       { icon: 'error',             label: 'Falha do agente',          cor: 'text-error' },
  lead_status_mudou:   { icon: 'swap_horiz',        label: 'Status do lead alterado' },
  cliente_status_mudou:{ icon: 'swap_horiz',        label: 'Status do cliente alterado' },
  cliente_criado:      { icon: 'person_add',        label: 'Cliente criado',           cor: 'text-green-status' },
}

export function getEventoConfig(tipo: string) {
  return EVENTO_CONFIG[tipo] ?? { icon: 'circle', label: tipo }
}
