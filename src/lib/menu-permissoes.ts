/**
 * Definições de menus e permissões por perfil.
 * Arquivo Edge-compatível — sem imports de Node.js.
 */

export type MenuPermissoes = {
  contador: string[]
  assistente: string[]
}

export type NavItemDef = {
  grupo: string
  href: string
  label: string
  icon: string
}

/** Lista canônica de todos os menus do CRM (mesma ordem da sidebar). */
export const MENUS_DISPONIVEIS: NavItemDef[] = [
  { grupo: 'Comercial',     href: '/crm/dashboard',                  label: 'Dashboard',        icon: '📊' },
  { grupo: 'Comercial',     href: '/crm/prospeccao',                 label: 'Prospecção',       icon: '📡' },
  { grupo: 'Comercial',     href: '/crm/leads',                      label: 'Onboarding',       icon: '🚀' },
  { grupo: 'Comercial',     href: '/crm/clientes',                   label: 'Clientes',         icon: '👥' },
  { grupo: 'Comercial',     href: '/crm/empresas',                   label: 'Empresas',         icon: '🏢' },
  { grupo: 'Atendimento',   href: '/crm/atendimentos',               label: 'Atendimentos',     icon: '💬' },
  { grupo: 'Atendimento',   href: '/crm/chamados',                   label: 'Chamados',         icon: '📋' },
  { grupo: 'Atendimento',   href: '/crm/emails',                     label: 'E-mails',          icon: '📧' },
  { grupo: 'Comunicação',   href: '/crm/comunicados',                label: 'Comunicados',      icon: '📢' },
  { grupo: 'Financeiro',    href: '/crm/financeiro/dashboard',       label: 'Dashboard Fin.',   icon: '💰' },
  { grupo: 'Financeiro',    href: '/crm/financeiro/funcionarios',    label: 'Funcionários',     icon: '👤' },
  { grupo: 'Financeiro',    href: '/crm/financeiro/inadimplentes',   label: 'Inadimplentes',    icon: '🔴' },
  { grupo: 'Financeiro',    href: '/crm/financeiro/reajuste',        label: 'Reajuste',         icon: '📈' },
  { grupo: 'Inteligência',  href: '/crm/relatorios',                 label: 'Relatórios IA',   icon: '🧠' },
  { grupo: 'Configurações', href: '/crm/configuracoes',              label: 'Configurações',    icon: '⚙️' },
]

/** Permissões padrão quando nenhuma configuração foi salva. */
export const DEFAULT_PERMISSOES: MenuPermissoes = {
  contador: [
    '/crm/dashboard',
    '/crm/prospeccao',
    '/crm/leads',
    '/crm/clientes',
    '/crm/empresas',
    '/crm/atendimentos',
    '/crm/chamados',
    '/crm/emails',
    '/crm/comunicados',
    '/crm/financeiro/dashboard',
    '/crm/financeiro/funcionarios',
    '/crm/financeiro/inadimplentes',
    '/crm/financeiro/reajuste',
    '/crm/relatorios',
  ],
  assistente: [
    '/crm/dashboard',
    '/crm/prospeccao',
    '/crm/leads',
    '/crm/clientes',
    '/crm/empresas',
    '/crm/atendimentos',
    '/crm/chamados',
    '/crm/emails',
    '/crm/comunicados',
    '/crm/financeiro/inadimplentes',
    '/crm/relatorios',
  ],
}

/** Extrai e valida permissões do valor JSON do banco (ou retorna defaults). Sempre retorna cópia — nunca mutável. */
export function resolverPermissoes(stored: unknown): MenuPermissoes {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return { contador: [...DEFAULT_PERMISSOES.contador], assistente: [...DEFAULT_PERMISSOES.assistente] }
  }
  const obj = stored as Record<string, unknown>
  return {
    contador:   Array.isArray(obj.contador)   ? [...(obj.contador as string[])]   : [...DEFAULT_PERMISSOES.contador],
    assistente: Array.isArray(obj.assistente) ? [...(obj.assistente as string[])] : [...DEFAULT_PERMISSOES.assistente],
  }
}

/**
 * Verifica se um role tem permissão para acessar um path.
 * Admin sempre tem acesso total.
 * Configurações só admin (regra hard no middleware).
 */
export function podeAcessarRota(tipo: string, path: string, permissoes: MenuPermissoes): boolean {
  if (tipo === 'admin') return true
  const lista = tipo === 'contador' ? permissoes.contador : permissoes.assistente
  return lista.some(href => path === href || path.startsWith(href + '/'))
}
